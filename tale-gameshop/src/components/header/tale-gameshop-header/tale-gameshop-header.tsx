import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import "./tale-gameshop-header.css";
import { localizeCountries } from "../../../utils/region-text";
import { useKeycloak } from "@react-keycloak/web";
import {
    faBars,
    faBolt,
    faChevronDown,
    faCircleUser,
    faLock,
    faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

// Знак магазина: лягушка с геймпадом. Рядом с ним в шапке стоит слово «Tale Shop»
// текстом, поэтому знаку не нужно нести на себе надпись — и на 42px он читается
// целиком, чего от прежней рисованной композиции добиться не удавалось.
import logo from "../../../assets/images/tale-shop-frog.svg";
import LoginAndRegisterSection from "../login-and-register-section/login-and-register-section";
import AdminPanelSection from "../admin-panel-section/admin-panel-section";
import container from "../../../inversify.config";
import type { IKeycloakAuthService } from "../../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../../constants/identifiers";
import CartIcon from "../../cart/cart-icon/cart-icon";
import HeaderSearch from "../header-search/header-search";
import { useSitePreferences, formatMoney } from "../../../context/site-preferences";
import { getCatalogPage } from "../../../api/catalogApi";
import { gamesCatalogPath } from "../../../utils/software";

// Компакт-режим шапки: скролл вниз складывает ряд навигации, остаётся одна строка
// (лого/поиск/корзина). Разворот — скролл вверх, наведение мыши или фокус клавиатуры.
const COLLAPSE_AFTER_PX = 120; // сколько нужно уехать вниз, чтобы шапка сжалась
const EXPAND_NEAR_TOP_PX = 80; // выше этой точки шапка всегда полная
const SCROLL_DELTA_PX = 8; // гистерезис: реагируем на осмысленный сдвиг, а не дрожание
const HOVER_EXPAND_DELAY_MS = 150; // «пролёт» курсора сквозь шапку не разворачивает её
const HOVER_COLLAPSE_DELAY_MS = 300; // и не захлопывает мгновенно, если курсор соскочил
// Развёрнутая скроллом вверх навигация не должна висеть вечно: если ею не пользуются
// (курсор не на шапке), через эту паузу она складывается сама.
const IDLE_RECOLLAPSE_MS = 2600;

// Top-level navigation after Store (Home and Store are rendered separately: Store carries the
// mega-menu). Подписи — из словаря по ключу пункта.
const navLinks = [
    { key: "deals", to: "/deals" },
    { key: "news", to: "/news" },
    { key: "about", to: "/about" },
    { key: "support", to: "/support" },
] as const;

/**
 * Сколько жанров показывает меню магазина: два ряда по три.
 *
 * Раньше список был зашит руками и успел разойтись с каталогом: пункт «Indie» вёл в пустой
 * фильтр — такого жанра в магазине нет вовсе, — а Adventure, Horror, Simulation и ещё три
 * настоящих жанра в меню не попадали. Теперь список приходит из фасетов каталога, как в
 * подвале: мёртвых ссылок в нём быть не может по построению.
 */
const STORE_GENRE_LIMIT = 6;

/**
 * Короткая подпись жанра для меню.
 *
 * В каталоге жанры записаны полными названиями — «Role-Playing Games (RPGs)». В узкой
 * колонке такое имя ломается на четыре строки, и ряд перестаёт читаться как ряд.
 * Если в названии есть сокращение в скобках, показываем именно его: оно и короче, и
 * привычнее. Ссылка при этом ведёт по ПОЛНОМУ названию — то есть подпись сокращаем,
 * а фильтр остаётся тем, что пришёл из каталога.
 */
const shortGenreLabel = (value: string): string => {
    const trimmed = value.trim();
    const open = trimmed.lastIndexOf('(');
    const close = trimmed.length - 1;
    // Сокращение — только если скобка закрывает всё название и внутри что-то есть.
    return open > 0 && trimmed[close] === ')' && close > open + 1
        ? trimmed.slice(open + 1, close)
        : trimmed;
};

/** Порог подборки «недорого»: и ссылка с фильтром, и подпись под ней. */
const BUDGET_PICKS_MAX_PRICE = 20;

/**
 * Список строится функцией, а не константой: в подписи стоит сумма, а её нельзя написать
 * буквами — валюта у каждого покупателя своя. Раньше здесь был зашитый «$20», и при выборе
 * другой валюты пункт меню обещал одно, а каталог показывал другое.
 */
const buildStoreDiscover = (currency: string, t: TFunction) => [
    // Каталог по умолчанию показывает и софт: пункт, обещающий игры, ведёт на «только игры».
    { label: t("header.allGames"), to: gamesCatalogPath(), desc: t("header.browseFullCatalog") },
    // «Deals» отсюда убран: он есть в верхнем меню и в карточке справа. Три входа
    // в одно место в одном выпадающем списке — это не выбор, а шум.
    {
        label: t("header.budgetPicks"),
        to: gamesCatalogPath({ filterMaxPrice: String(BUDGET_PICKS_MAX_PRICE) }),
        desc: t("header.budgetPicksDesc", { price: formatMoney(BUDGET_PICKS_MAX_PRICE, currency, { compact: true }) }),
    },
];

// Small reusable popover used for the language and currency switchers.
interface PrefMenuProps {
    id: string;
    triggerLabel: React.ReactNode;
    ariaLabel: string;
    align?: "left" | "right";
    /** open передаётся, чтобы тяжёлое содержимое монтировалось только при открытии. */
    children: (close: () => void, open: boolean) => React.ReactNode;
}

const PrefMenu: React.FC<PrefMenuProps> = ({ id, triggerLabel, ariaLabel, align = "right", children }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onClick = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div className="pref-menu" ref={rootRef}>
            <button
                type="button"
                className={`pref-trigger ${open ? "is-open" : ""}`}
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={id}
                aria-label={ariaLabel}
                onClick={() => setOpen((prev) => !prev)}
            >
                {triggerLabel}
                <FontAwesomeIcon className="pref-caret" icon={faChevronDown} />
            </button>
            <div id={id} className={`pref-dropdown pref-dropdown-${align} ${open ? "open" : ""}`} role="menu">
                {children(() => setOpen(false), open)}
            </div>
        </div>
    );
};

export default function TaleGameshopHeader() {
    const { t } = useTranslation();
    const { keycloak, initialized } = useKeycloak();
    const location = useLocation();
    const { lang, currency, setLang, setCurrency, languages, currencies, canSwitchCurrency, country, countries: countryCatalog, setCountry } = useSitePreferences();
    // Названия стран — на языке сайта; каталог сервера английский и служит запасом.
    const countries = useMemo(() => localizeCountries(countryCatalog), [countryCatalog, lang]);
    // Поиск по странам живёт здесь: их 248, и меню без него бесполезно.
    const [countryQuery, setCountryQuery] = useState("");
    /**
     * Содержимое меню «Store»: жанры с числом игр и сколько всего сейчас со скидкой.
     * Один запрос даёт и то, и другое — фасеты каталога считаются на сервере вместе с
     * выдачей, поэтому просим страницу из одной позиции, а берём только счётчики.
     */
    const [storeMenu, setStoreMenu] = useState<{
        genres: { label: string; fullName: string; to: string; count: number }[];
        onSale: number;
    } | null>(null);

    useEffect(() => {
        let cancelled = false;
        getCatalogPage(new URLSearchParams({ pageSize: "1" }))
            .then((page) => {
                if (cancelled) {
                    return;
                }
                setStoreMenu({
                    genres: [...page.facets.categories]
                        .sort((a, b) => b.count - a.count)
                        .slice(0, STORE_GENRE_LIMIT)
                        .map((facet) => ({
                            label: shortGenreLabel(facet.label ?? facet.value),
                            fullName: facet.label ?? facet.value,
                            // Тот же параметр, что и раньше: каталог сравнивает категорию
                            // без учёта регистра и по подстроке.
                            to: `/games?filterCategory=${encodeURIComponent(facet.value)}`,
                            count: facet.count,
                        })),
                    onSale: page.facets.availability.onSale,
                });
            })
            .catch(() => {
                // Каталог не ответил — меню покажет только «Discover», без выдуманных жанров.
                if (!cancelled) {
                    setStoreMenu(null);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDrawerAccountOpen, setIsDrawerAccountOpen] = useState(false);
    const [isDrawerStoreOpen, setIsDrawerStoreOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    // isCondensed — вердикт скролла; isPointerExpanded — временный разворот мышью/фокусом.
    const [isCondensed, setIsCondensed] = useState(false);
    const [isPointerExpanded, setIsPointerExpanded] = useState(false);

    const accountMenuRef = useRef<HTMLDivElement | null>(null);
    const accountButtonRef = useRef<HTMLButtonElement | null>(null);
    const headerRef = useRef<HTMLElement | null>(null);
    const hoverTimerRef = useRef<number | null>(null);
    const idleTimerRef = useRef<number | null>(null);
    const lastScrollYRef = useRef(0);
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    // Свёрнута ли шапка фактически (скролл сказал «сжаться», а мышь/фокус не удерживают её).
    const isCollapsed = isCondensed && !isPointerExpanded;
    const isCollapsedRef = useRef(isCollapsed);
    isCollapsedRef.current = isCollapsed;

    // Publish the real rendered header height as a CSS variable so page spacers and the hero
    // can offset content correctly.
    // В компакт-режиме высоту НЕ переопубликовываем: контент отступает от полной шапки,
    // иначе каждое складывание/разворачивание дёргало бы всю страницу.
    useLayoutEffect(() => {
        const el = headerRef.current;
        if (!el) {
            return;
        }
        let settleTimer: number | null = null;
        const publish = () => {
            if (isCollapsedRef.current) {
                return;
            }
            document.documentElement.style.setProperty("--app-header-height", `${el.offsetHeight}px`);
        };
        // Изменения высоты публикуем с задержкой чуть больше анимации складывания (0.36s):
        // иначе observer протолкнул бы промежуточные высоты разворота и контент бы дёргался.
        const publishSettled = () => {
            if (settleTimer !== null) {
                window.clearTimeout(settleTimer);
            }
            settleTimer = window.setTimeout(publish, 400);
        };
        publish();
        const observer = new ResizeObserver(publishSettled);
        observer.observe(el);
        // Смена ширины окна меняет компоновку шапки — разворачиваем, чтобы замерить полную высоту.
        const onResize = () => {
            setIsCondensed(false);
            publishSettled();
        };
        window.addEventListener("resize", onResize);
        return () => {
            if (settleTimer !== null) {
                window.clearTimeout(settleTimer);
            }
            observer.disconnect();
            window.removeEventListener("resize", onResize);
        };
        // Пустые зависимости: высота шапки больше ни от какого состояния не зависит, а её
        // изменения ловит ResizeObserver. Раньше здесь стоял флаг показа верхней планки.
    }, []);

    // Фактическая высота шапки прямо сейчас — включая промежуточные кадры сворачивания.
    // В отличие от --app-header-height (та держит ПОЛНУЮ высоту, чтобы распорка страницы
    // не дёргалась при каждом складывании), эта переменная переиздаётся и в компакт-режиме:
    // на неё завязаны липкие элементы, которые должны подъезжать вслед за шапкой.
    useLayoutEffect(() => {
        const el = headerRef.current;
        if (!el) {
            return;
        }
        const publishOffset = () => {
            document.documentElement.style.setProperty("--app-header-offset", `${el.offsetHeight}px`);
        };
        publishOffset();
        // Без задержки: max-height ряда навигации анимируется 0.36s, и нужен каждый её кадр,
        // иначе липкие элементы прыгнут в конечное положение вместо плавного подъезда.
        const observer = new ResizeObserver(publishOffset);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Shadow-on-scroll + компакт-режим: вниз — складываемся, вверх или у верха — разворачиваемся.
    useEffect(() => {
        lastScrollYRef.current = window.scrollY;
        const clearIdleTimer = () => {
            if (idleTimerRef.current !== null) {
                window.clearTimeout(idleTimerRef.current);
                idleTimerRef.current = null;
            }
        };
        // Разворот посреди страницы — временный: без взаимодействия складываемся обратно.
        // Если курсор на шапке, isPointerExpanded удержит её открытой и после этого таймера.
        const scheduleIdleCollapse = () => {
            clearIdleTimer();
            idleTimerRef.current = window.setTimeout(() => {
                idleTimerRef.current = null;
                if (window.scrollY > COLLAPSE_AFTER_PX) {
                    setIsCondensed(true);
                }
            }, IDLE_RECOLLAPSE_MS);
        };
        const onScroll = () => {
            const el = headerRef.current;
            if (!el) {
                return;
            }
            const y = window.scrollY;
            el.classList.toggle("scrolled", y > 4);
            const delta = y - lastScrollYRef.current;
            if (y <= EXPAND_NEAR_TOP_PX) {
                lastScrollYRef.current = y;
                clearIdleTimer();
                setIsCondensed(false);
                return;
            }
            if (Math.abs(delta) < SCROLL_DELTA_PX) {
                return;
            }
            lastScrollYRef.current = y;
            if (delta < 0) {
                setIsCondensed(false);
                scheduleIdleCollapse();
            } else if (y > COLLAPSE_AFTER_PX) {
                clearIdleTimer();
                setIsCondensed(true);
                setIsPointerExpanded(false);
            }
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            clearIdleTimer();
            window.removeEventListener("scroll", onScroll);
        };
    }, []);

    // Разворот наведением/фокусом — с задержками, чтобы транзитный «пролёт» курсора
    // через шапку (к вкладкам браузера и обратно) не хлопал ею туда-сюда.
    const scheduleHover = (expand: boolean, delay: number) => {
        if (hoverTimerRef.current !== null) {
            window.clearTimeout(hoverTimerRef.current);
        }
        hoverTimerRef.current = window.setTimeout(() => {
            hoverTimerRef.current = null;
            setIsPointerExpanded(expand);
        }, delay);
    };

    useEffect(() => () => {
        if (hoverTimerRef.current !== null) {
            window.clearTimeout(hoverTimerRef.current);
        }
    }, []);

    // Close menus on navigation.
    useEffect(() => {
        setIsMenuOpen(false);
        setIsAccountOpen(false);
    }, [location.pathname, location.search]);

    useEffect(() => {
        if (!isAccountOpen) {
            return;
        }
        const handleClickOutside = (event: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
                setIsAccountOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsAccountOpen(false);
                accountButtonRef.current?.focus();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isAccountOpen]);

    useEffect(() => {
        if (!isMenuOpen) {
            setIsDrawerAccountOpen(false);
            setIsDrawerStoreOpen(false);
        }
    }, [isMenuOpen]);

    // Lock body scroll while the mobile drawer is open.
    useEffect(() => {
        if (isMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isMenuOpen]);

    // В токене Keycloak роли клиента лежат в resource_access, а почта — отдельным полем; типы keycloak-js их не описывают.
    const token = keycloak.tokenParsed as { email?: string; resource_access?: Record<string, { roles?: string[] }> } | undefined;
    const isAdmin = token?.resource_access?.["tale-shop-app"]?.roles?.some((role) => role === "admin");
    const email = token?.email;

    const handleLogout = async () => {
        await keycloakAuthService.logoutWithRedirect(keycloak, window.location.href);
    };

    const currentCurrency = currencies.find((c) => c.code === currency) ?? currencies[0];
    const currentLang = languages.find((l) => l.code === lang) ?? languages[0];
    const currentCountry = country ? countries.find((option) => option.code === country) ?? null : null;
    const countryMatches = (() => {
        const needle = countryQuery.trim().toLowerCase();
        if (!needle) {
            return countries;
        }
        return countries.filter(
            (option) => option.name.toLowerCase().includes(needle) || option.code.toLowerCase().startsWith(needle),
        );
    })();

    return (
        <header
            className={`site-header${isCollapsed ? " is-collapsed" : ""}`}
            ref={headerRef}
            onMouseEnter={() => scheduleHover(true, HOVER_EXPAND_DELAY_MS)}
            onMouseLeave={() => scheduleHover(false, HOVER_COLLAPSE_DELAY_MS)}
            // Фокус клавиатуры (Tab в поиск и дальше) тоже разворачивает свёрнутую навигацию.
            onFocus={() => scheduleHover(true, 0)}
            onBlur={() => scheduleHover(false, 0)}
        >
            {/* Primary bar: brand · search · tools · account */}
            <div className="header-primary">
                <div className="container header-primary-inner">
                    <Link className="brand" to="/" aria-label={t("header.brandHome")}>
                        <img src={logo} alt={t("header.logoAlt")} />
                        <span className="brand-name">{t("common.brand")}</span>
                    </Link>

                    <HeaderSearch />

                    <div className="header-tools">
                        <div className="pref-cluster">
                            <PrefMenu
                                id="lang-menu"
                                ariaLabel={t("header.changeLanguage")}
                                triggerLabel={
                                    <span className="pref-trigger-label">
                                        <svg className="pref-globe" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                            <path
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.7"
                                                d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2.5 2.5 15.5 0 18m0-18c-2.5 2.5-2.5 15.5 0 18M3.5 9h17M3.5 15h17"
                                            />
                                        </svg>
                                        {currentLang.short}
                                    </span>
                                }
                            >
                                {(close) =>
                                    languages.map((option) => (
                                        <button
                                            key={option.code}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={option.code === lang}
                                            className={`pref-option ${option.code === lang ? "is-active" : ""}`}
                                            onClick={() => {
                                                setLang(option.code);
                                                close();
                                            }}
                                        >
                                            <span className="pref-option-badge">{option.short}</span>
                                            {option.label}
                                        </button>
                                    ))
                                }
                            </PrefMenu>

                            {/* Выбирать не из чего, пока сервер отдаёт одну валюту — меню скрыто,
                                чтобы не обещать выбор, которого нет. */}
                            {canSwitchCurrency && (
                                <PrefMenu
                                    id="currency-menu"
                                    ariaLabel={t("header.changeCurrency")}
                                    triggerLabel={
                                        <span className="pref-trigger-label">
                                            <span className="pref-currency-symbol">{currentCurrency.symbol}</span>
                                            {currentCurrency.code}
                                        </span>
                                    }
                                >
                                    {(close) =>
                                        currencies.map((option) => (
                                            <button
                                                key={option.code}
                                                type="button"
                                                role="menuitemradio"
                                                aria-checked={option.code === currency}
                                                className={`pref-option ${option.code === currency ? "is-active" : ""}`}
                                                onClick={() => {
                                                    setCurrency(option.code);
                                                    close();
                                                }}
                                            >
                                                <span className="pref-option-badge">{option.symbol}</span>
                                                {option.code} · {option.label}
                                            </button>
                                        ))
                                    }
                                </PrefMenu>
                            )}
                            {/* Страна покупателя стоит рядом с языком и валютой, потому что она такая
                                же настройка всего сайта: по ней считается, где активируется ключ —
                                в каталоге, на карточке игры, в корзине и на кассе, — и от неё же
                                подбирается валюта. Раньше поменять её можно было только из корзины,
                                и настройка, влияющая на весь магазин, выглядела свойством заказа. */}
                            {countries.length > 0 && (
                                <PrefMenu
                                    id="country-menu"
                                    ariaLabel={t("header.changeCountry")}
                                    triggerLabel={
                                        <span className="pref-trigger-label">
                                            <svg className="pref-globe" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                                <path
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.7"
                                                    d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"
                                                />
                                                <circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                                            </svg>
                                            {currentCountry?.code ?? t("header.country")}
                                        </span>
                                    }
                                >
                                    {(close, open) => !open ? null : (
                                        // Список монтируется только открытым: 248 кнопок не висят
                                        // в разметке каждой страницы, а поиск получает фокус сразу.
                                        <div className="pref-country">
                                            <input
                                                className="pref-country-search"
                                                placeholder={t("header.searchCountry")}
                                                value={countryQuery}
                                                // autoFocus здесь не срабатывает: в момент монтирования
                                                // панель ещё скрыта переходом, и focus() ничего не делает.
                                                // Ставим фокус следующей задачей — таймер, а не кадр
                                                // анимации: кадры не приходят во вкладке, которая сейчас
                                                // не на экране, и фокус тогда не встал бы вовсе.
                                                ref={(el) => { if (el) setTimeout(() => el.focus(), 0); }}
                                                onChange={(event) => setCountryQuery(event.target.value)}
                                            />
                                            <div className="pref-country-list">
                                                {countryMatches.map((option) => (
                                                    <button
                                                        key={option.code}
                                                        type="button"
                                                        role="menuitemradio"
                                                        aria-checked={option.code === country}
                                                        className={`pref-option ${option.code === country ? "is-active" : ""}`}
                                                        onClick={() => {
                                                            setCountry(option.code);
                                                            setCountryQuery("");
                                                            close();
                                                        }}
                                                    >
                                                        <span className="pref-option-badge">{option.code}</span>
                                                        {option.name}
                                                    </button>
                                                ))}
                                                {countryMatches.length === 0 && (
                                                    <p className="pref-country-empty">{t("header.noSuchCountry")}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </PrefMenu>
                            )}
                        </div>

                        <div className="header-cart">
                            <CartIcon isText={false} />
                        </div>

                        {/* Три состояния, а не два. Пока Keycloak не ответил, личность
                            НЕИЗВЕСТНА — и показывать «Login» вошедшему человеку значит
                            соврать ему на полсекунды. Вместо этого держим место заглушкой:
                            шапка не прыгает, и неверное состояние не мелькает. */}
                        {!initialized ? (
                            <div className="header-auth">
                                <span className="header-auth-skeleton" aria-hidden="true" />
                            </div>
                        ) : !keycloak.authenticated ? (
                            <div className="header-auth">
                                <LoginAndRegisterSection />
                            </div>
                        ) : (
                            <div className="header-auth">
                                {isAdmin && <AdminPanelSection />}
                                <div className="account-menu" ref={accountMenuRef}>
                                    <button
                                        className="account-trigger"
                                        type="button"
                                        onClick={() => setIsAccountOpen((prev) => !prev)}
                                        aria-expanded={isAccountOpen}
                                        aria-haspopup="true"
                                        ref={accountButtonRef}
                                    >
                                        <FontAwesomeIcon icon={faCircleUser} />
                                        <span className="account-trigger-label">{t("common.account")}</span>
                                        <FontAwesomeIcon className="caret" icon={faChevronDown} />
                                    </button>
                                    <div className={`account-dropdown ${isAccountOpen ? "open" : ""}`}>
                                        <div className="account-signed-in">
                                            {t("header.signedInAs")} <span>{email}</span>
                                        </div>
                                        <div className="account-links">
                                            <Link to="/account" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                                {t("header.profile")}
                                            </Link>
                                            <Link to="/account/orders" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                                {t("header.orders")}
                                            </Link>
                                            <Link to="/account/keys" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                                {t("header.keys")}
                                            </Link>
                                            <Link to="/account/settings" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                                {t("header.settings")}
                                            </Link>
                                        </div>
                                        <button className="account-link sign-out" type="button" onClick={handleLogout}>
                                            {t("common.signOut")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            className="menu-toggle"
                            onClick={() => setIsMenuOpen((prev) => !prev)}
                            aria-label={t("header.toggleMenu")}
                            aria-expanded={isMenuOpen}
                        >
                            <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Secondary bar: category navigation + Store mega-menu */}
            <div className="header-nav-bar">
                <div className="container header-nav-inner">
                    <ul className="nav-links">
                        <li>
                            <NavLink
                                to="/"
                                end
                                className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                            >
                                {t("common.nav.home")}
                            </NavLink>
                        </li>
                        <li className="nav-store">
                            <NavLink
                                to="/games"
                                className={({ isActive }) => `nav-item nav-store-trigger ${isActive ? "is-active" : ""}`}
                            >
                                {t("common.nav.store")}
                                <FontAwesomeIcon className="nav-store-caret" icon={faChevronDown} />
                            </NavLink>
                            <div className="mega-menu" role="menu" aria-label={t("header.storeCategories")}>
                                <div className="mega-inner">
                                    {storeMenu && storeMenu.genres.length > 0 && (
                                        <div className="mega-col">
                                            <div className="mega-heading">{t("header.browseByGenre")}</div>
                                            <div className="mega-genres">
                                                {storeMenu.genres.map((genre) => (
                                                    <Link
                                                        key={genre.fullName}
                                                        to={genre.to}
                                                        className="mega-genre"
                                                        title={genre.fullName}
                                                    >
                                                        <span className="mega-genre-label">{genre.label}</span>
                                                        {/* Число рядом с жанром — то же, что каталог покажет
                                                            после перехода: оба берутся из одного фасета. */}
                                                        <span className="mega-genre-count">{genre.count}</span>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="mega-col">
                                        <div className="mega-heading">{t("header.discover")}</div>
                                        <div className="mega-discover">
                                            {buildStoreDiscover(currency, t).map((item) => (
                                                <Link key={item.label} to={item.to} className="mega-discover-item">
                                                    <span className="mega-discover-label">{item.label}</span>
                                                    <span className="mega-discover-desc">{item.desc}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Было «Weekly deals — fresh discounts, updated every week»: недельного
                                        цикла у скидок нет, их заводят когда угодно, так что обещание держать
                                        нечем. Вместо него — то, что можно проверить прямо сейчас: сколько игр
                                        со скидкой. Число то же, что покажет страница скидок. */}
                                    {/* Скидок может не быть вовсе — тогда прежний текст превращался в
                                        «0 games on sale» и тут же обещал price drops, которых нет. В этом
                                        случае плитка говорит то же, что и сама страница скидок: сейчас
                                        пусто, но можно подписаться на следующую волну. */}
                                    <Link to="/deals" className="mega-promo">
                                        <FontAwesomeIcon icon={faBolt} />
                                        <span className="mega-promo-title">
                                            {!storeMenu
                                                ? t("header.onSaleNow")
                                                : storeMenu.onSale > 0
                                                  ? t("header.gamesOnSale", { count: storeMenu.onSale })
                                                  : t("header.noDealsNow")}
                                        </span>
                                        <span className="mega-promo-desc">
                                            {storeMenu && storeMenu.onSale === 0 ? t("header.dealsDescEmpty") : t("header.dealsDesc")}
                                        </span>
                                        <span className="mega-promo-cta">
                                            {storeMenu && storeMenu.onSale === 0 ? t("header.getNotified") : t("header.shopDeals")}
                                        </span>
                                    </Link>
                                </div>
                            </div>
                        </li>
                        {/* Раздел ПО — рядом с магазином игр, со своим меню категорий. Пока ПО нет,
                            пункт не показываем: он вёл бы на пустую страницу. */}
                        {navLinks.map((link) => (
                            <li key={link.key}>
                                <NavLink
                                    to={link.to}
                                    className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                                >
                                    {t(`common.nav.${link.key}`)}
                                </NavLink>
                            </li>
                        ))}
                    </ul>

                    <div className="nav-trust">
                        <FontAwesomeIcon icon={faLock} />
                        <span>{t("header.buyerProtected")}</span>
                    </div>
                </div>
            </div>

            {/* Mobile drawer */}
            <div className={`nav-drawer ${isMenuOpen ? "open" : ""}`}>
                <HeaderSearch variant="drawer" onNavigated={() => setIsMenuOpen(false)} />

                <ul className="drawer-links">
                    <li>
                        <NavLink to="/" end className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                            {t("common.nav.home")}
                        </NavLink>
                    </li>
                    <li>
                        <div className="drawer-store-row">
                            <NavLink to="/games" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                {t("common.nav.store")}
                            </NavLink>
                            <button
                                type="button"
                                className={`drawer-store-toggle ${isDrawerStoreOpen ? "open" : ""}`}
                                aria-expanded={isDrawerStoreOpen}
                                aria-label={t("header.showStoreCategories")}
                                onClick={() => setIsDrawerStoreOpen((prev) => !prev)}
                            >
                                <FontAwesomeIcon icon={faChevronDown} />
                            </button>
                        </div>
                        <div className={`drawer-sublinks ${isDrawerStoreOpen ? "open" : ""}`}>
                            <Link to={gamesCatalogPath()} className="drawer-sublink" onClick={() => setIsMenuOpen(false)}>
                                {t("header.allGames")}
                            </Link>
                            {/* Тот же список, что и в меню на широком экране: жанры из каталога. */}
                            {(storeMenu?.genres ?? []).map((genre) => (
                                <Link
                                    key={genre.fullName}
                                    to={genre.to}
                                    className="drawer-sublink"
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    {/* В ящике строка во всю ширину — сокращать незачем. */}
                                    {genre.fullName}
                                </Link>
                            ))}
                        </div>
                    </li>
                    {navLinks.map((link) => (
                        <li key={link.key}>
                            <NavLink to={link.to} className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                {t(`common.nav.${link.key}`)}
                            </NavLink>
                        </li>
                    ))}
                    {isAdmin && (
                        <li>
                            <AdminPanelSection onClick={() => setIsMenuOpen(false)} className="drawer-link drawer-admin" />
                        </li>
                    )}
                </ul>

                <div className="drawer-prefs">
                    <div className="drawer-pref-group" role="group" aria-label={t("header.language")}>
                        <span className="drawer-pref-caption">{t("header.language")}</span>
                        <div className="drawer-pref-options">
                            {languages.map((option) => (
                                <button
                                    key={option.code}
                                    type="button"
                                    className={`drawer-pref-chip ${option.code === lang ? "is-active" : ""}`}
                                    onClick={() => setLang(option.code)}
                                >
                                    {option.short}
                                </button>
                            ))}
                        </div>
                    </div>
                    {canSwitchCurrency && (
                        <div className="drawer-pref-group" role="group" aria-label={t("header.currency")}>
                            <span className="drawer-pref-caption">{t("header.currency")}</span>
                            <div className="drawer-pref-options">
                                {currencies.map((option) => (
                                    <button
                                        key={option.code}
                                        type="button"
                                        className={`drawer-pref-chip ${option.code === currency ? "is-active" : ""}`}
                                        onClick={() => setCurrency(option.code)}
                                    >
                                        {option.code}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="drawer-actions">
                    {!initialized ? (
                        <span className="header-auth-skeleton is-stacked" aria-hidden="true" />
                    ) : !keycloak.authenticated ? (
                        <LoginAndRegisterSection stacked />
                    ) : (
                        <div className="drawer-account">
                            <button
                                className={`drawer-account-trigger ${isDrawerAccountOpen ? "open" : ""}`}
                                type="button"
                                onClick={() => setIsDrawerAccountOpen((prev) => !prev)}
                                aria-expanded={isDrawerAccountOpen}
                            >
                                <span className="drawer-account-title">
                                    <FontAwesomeIcon icon={faCircleUser} />
                                    {t("header.myAccount")}
                                </span>
                                <FontAwesomeIcon className="drawer-account-caret" icon={faChevronDown} />
                            </button>
                            <div className="drawer-account-email">{t("header.signedInAs")} {email}</div>
                            <div className={`drawer-account-links ${isDrawerAccountOpen ? "open" : ""}`}>
                                <Link to="/account" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    {t("header.profile")}
                                </Link>
                                <Link to="/account/orders" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    {t("header.orders")}
                                </Link>
                                <Link to="/account/keys" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    {t("header.keys")}
                                </Link>
                                <Link to="/account/settings" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    {t("header.settings")}
                                </Link>
                                <button className="drawer-sign-out" type="button" onClick={handleLogout}>
                                    {t("common.signOut")}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isMenuOpen && <div className="drawer-scrim" onClick={() => setIsMenuOpen(false)} aria-hidden="true" />}
        </header>
    );
}
