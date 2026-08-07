import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import "./tale-gameshop-header.css";
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

import logo from "../../../assets/images/tale-shop-logo.svg";
import LoginAndRegisterSection from "../login-and-register-section/login-and-register-section";
import AdminPanelSection from "../admin-panel-section/admin-panel-section";
import container from "../../../inversify.config";
import type { IKeycloakAuthService } from "../../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../../constants/identifiers";
import CartIcon from "../../cart/cart-icon/cart-icon";
import HeaderSearch from "../header-search/header-search";
import { useSitePreferences } from "../../../context/site-preferences";

const ANNOUNCEMENT_KEY = "taleshop_announcement_dismissed_v1";

// Компакт-режим шапки: скролл вниз складывает announcement и ряд навигации, остаётся одна
// строка (лого/поиск/корзина). Разворот — скролл вверх, наведение мыши или фокус клавиатуры.
const COLLAPSE_AFTER_PX = 120; // сколько нужно уехать вниз, чтобы шапка сжалась
const EXPAND_NEAR_TOP_PX = 80; // выше этой точки шапка всегда полная
const SCROLL_DELTA_PX = 8; // гистерезис: реагируем на осмысленный сдвиг, а не дрожание
const HOVER_EXPAND_DELAY_MS = 150; // «пролёт» курсора сквозь шапку не разворачивает её
const HOVER_COLLAPSE_DELAY_MS = 300; // и не захлопывает мгновенно, если курсор соскочил
// Развёрнутая скроллом вверх навигация не должна висеть вечно: если ею не пользуются
// (курсор не на шапке), через эту паузу она складывается сама.
const IDLE_RECOLLAPSE_MS = 2600;

// Top-level navigation. Store is rendered separately because it carries the mega-menu.
const navLinks = [
    { label: "Home", to: "/" },
    { label: "Deals", to: "/deals" },
    { label: "News", to: "/news" },
    { label: "About", to: "/about" },
    { label: "Support", to: "/support" },
];

// Store mega-menu. Genre links reuse the catalog's case-insensitive `filterCategory` match,
// so short labels like "RPG" resolve to "Role-Playing Games (RPGs)" on the Store page.
const storeGenres = [
    { label: "Action", to: "/games?filterCategory=Action" },
    { label: "RPG", to: "/games?filterCategory=RPG" },
    { label: "Strategy", to: "/games?filterCategory=Strategy" },
    { label: "Puzzle", to: "/games?filterCategory=Puzzle" },
    { label: "Indie", to: "/games?filterCategory=Indie" },
    { label: "Sports", to: "/games?filterCategory=Sports" },
];

const storeDiscover = [
    { label: "All games", to: "/games", desc: "Browse the full catalog" },
    { label: "Deals", to: "/deals", desc: "Discounts live right now" },
    { label: "Budget picks", to: "/games?filterMaxPrice=20", desc: "Great games under $20" },
];

// Small reusable popover used for the language and currency switchers.
interface PrefMenuProps {
    id: string;
    triggerLabel: React.ReactNode;
    ariaLabel: string;
    align?: "left" | "right";
    children: (close: () => void) => React.ReactNode;
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
                {children(() => setOpen(false))}
            </div>
        </div>
    );
};

export default function TaleGameshopHeader() {
    const { keycloak } = useKeycloak();
    const location = useLocation();
    const { lang, currency, setLang, setCurrency, languages, currencies } = useSitePreferences();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDrawerAccountOpen, setIsDrawerAccountOpen] = useState(false);
    const [isDrawerStoreOpen, setIsDrawerStoreOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [showAnnouncement, setShowAnnouncement] = useState(true);
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

    // Remember the announcement-bar dismissal across visits.
    useEffect(() => {
        setShowAnnouncement(localStorage.getItem(ANNOUNCEMENT_KEY) !== "1");
    }, []);

    // Publish the real rendered header height as a CSS variable so page spacers and the hero
    // can offset content correctly regardless of whether the announcement bar is shown.
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
    }, [showAnnouncement]);

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

    const isAdmin = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"].some(
        (role) => role === "admin"
    );
    const email = keycloak.tokenParsed?.email;

    const handleLogout = async () => {
        await keycloakAuthService.logoutWithRedirect(keycloak, window.location.href);
    };

    const currentCurrency = currencies.find((c) => c.code === currency) ?? currencies[0];
    const currentLang = languages.find((l) => l.code === lang) ?? languages[0];

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
            {showAnnouncement && (
                <div className="announcement-bar">
                    <div className="container announcement-inner">
                        <p className="announcement-text">
                            <FontAwesomeIcon icon={faBolt} />
                            <span>Instant delivery</span>
                            <span className="announcement-dot" aria-hidden="true">·</span>
                            <FontAwesomeIcon icon={faLock} />
                            <span>Secure checkout</span>
                            <span className="announcement-dot" aria-hidden="true">·</span>
                            <span>Support in EN / RU</span>
                        </p>
                        <button
                            type="button"
                            className="announcement-close"
                            aria-label="Dismiss announcement"
                            onClick={() => {
                                setShowAnnouncement(false);
                                localStorage.setItem(ANNOUNCEMENT_KEY, "1");
                            }}
                        >
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    </div>
                </div>
            )}

            {/* Primary bar: brand · search · tools · account */}
            <div className="header-primary">
                <div className="container header-primary-inner">
                    <Link className="brand" to="/" aria-label="Tale Shop — home">
                        <img src={logo} alt="Tale Shop logo" />
                        <span className="brand-name">Tale Shop</span>
                    </Link>

                    <HeaderSearch />

                    <div className="header-tools">
                        <div className="pref-cluster">
                            <PrefMenu
                                id="lang-menu"
                                ariaLabel="Change language"
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

                            <PrefMenu
                                id="currency-menu"
                                ariaLabel="Change currency"
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
                        </div>

                        <div className="header-cart">
                            <CartIcon isText={false} />
                        </div>

                        {!keycloak.authenticated ? (
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
                                        <span className="account-trigger-label">Account</span>
                                        <FontAwesomeIcon className="caret" icon={faChevronDown} />
                                    </button>
                                    <div className={`account-dropdown ${isAccountOpen ? "open" : ""}`}>
                                        <div className="account-signed-in">
                                            Signed in as <span>{email}</span>
                                        </div>
                                        <div className="account-links">
                                            <Link to="/account" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                                Profile
                                            </Link>
                                            <Link to="/account/orders" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                                Orders
                                            </Link>
                                            <Link to="/account/keys" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                                Keys
                                            </Link>
                                            <Link to="/account/settings" className="account-link" onClick={() => setIsAccountOpen(false)}>
                                                Settings
                                            </Link>
                                        </div>
                                        <button className="account-link sign-out" type="button" onClick={handleLogout}>
                                            Sign out
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            className="menu-toggle"
                            onClick={() => setIsMenuOpen((prev) => !prev)}
                            aria-label="Toggle menu"
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
                                Home
                            </NavLink>
                        </li>
                        <li className="nav-store">
                            <NavLink
                                to="/games"
                                className={({ isActive }) => `nav-item nav-store-trigger ${isActive ? "is-active" : ""}`}
                            >
                                Store
                                <FontAwesomeIcon className="nav-store-caret" icon={faChevronDown} />
                            </NavLink>
                            <div className="mega-menu" role="menu" aria-label="Store categories">
                                <div className="mega-inner">
                                    <div className="mega-col">
                                        <div className="mega-heading">Browse by genre</div>
                                        <div className="mega-genres">
                                            {storeGenres.map((genre) => (
                                                <Link key={genre.label} to={genre.to} className="mega-genre">
                                                    {genre.label}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mega-col">
                                        <div className="mega-heading">Discover</div>
                                        <div className="mega-discover">
                                            {storeDiscover.map((item) => (
                                                <Link key={item.label} to={item.to} className="mega-discover-item">
                                                    <span className="mega-discover-label">{item.label}</span>
                                                    <span className="mega-discover-desc">{item.desc}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                    <Link to="/deals" className="mega-promo">
                                        <FontAwesomeIcon icon={faBolt} />
                                        <span className="mega-promo-title">Weekly deals</span>
                                        <span className="mega-promo-desc">Fresh discounts, updated every week.</span>
                                        <span className="mega-promo-cta">Shop deals →</span>
                                    </Link>
                                </div>
                            </div>
                        </li>
                        {navLinks
                            .filter((link) => link.label !== "Home")
                            .map((link) => (
                                <li key={link.label}>
                                    <NavLink
                                        to={link.to}
                                        className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                                    >
                                        {link.label}
                                    </NavLink>
                                </li>
                            ))}
                    </ul>

                    <div className="nav-trust">
                        <FontAwesomeIcon icon={faLock} />
                        <span>Buyer-protected checkout</span>
                    </div>
                </div>
            </div>

            {/* Mobile drawer */}
            <div className={`nav-drawer ${isMenuOpen ? "open" : ""}`}>
                <HeaderSearch variant="drawer" onNavigated={() => setIsMenuOpen(false)} />

                <ul className="drawer-links">
                    <li>
                        <NavLink to="/" end className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                            Home
                        </NavLink>
                    </li>
                    <li>
                        <div className="drawer-store-row">
                            <NavLink to="/games" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                Store
                            </NavLink>
                            <button
                                type="button"
                                className={`drawer-store-toggle ${isDrawerStoreOpen ? "open" : ""}`}
                                aria-expanded={isDrawerStoreOpen}
                                aria-label="Show store categories"
                                onClick={() => setIsDrawerStoreOpen((prev) => !prev)}
                            >
                                <FontAwesomeIcon icon={faChevronDown} />
                            </button>
                        </div>
                        <div className={`drawer-sublinks ${isDrawerStoreOpen ? "open" : ""}`}>
                            <Link to="/games" className="drawer-sublink" onClick={() => setIsMenuOpen(false)}>
                                All games
                            </Link>
                            {storeGenres.map((genre) => (
                                <Link
                                    key={genre.label}
                                    to={genre.to}
                                    className="drawer-sublink"
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    {genre.label}
                                </Link>
                            ))}
                        </div>
                    </li>
                    {navLinks
                        .filter((link) => link.label !== "Home")
                        .map((link) => (
                            <li key={link.label}>
                                <NavLink to={link.to} className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    {link.label}
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
                    <div className="drawer-pref-group" role="group" aria-label="Language">
                        <span className="drawer-pref-caption">Language</span>
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
                    <div className="drawer-pref-group" role="group" aria-label="Currency">
                        <span className="drawer-pref-caption">Currency</span>
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
                </div>

                <div className="drawer-actions">
                    {!keycloak.authenticated ? (
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
                                    My account
                                </span>
                                <FontAwesomeIcon className="drawer-account-caret" icon={faChevronDown} />
                            </button>
                            <div className="drawer-account-email">Signed in as {email}</div>
                            <div className={`drawer-account-links ${isDrawerAccountOpen ? "open" : ""}`}>
                                <Link to="/account" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    Profile
                                </Link>
                                <Link to="/account/orders" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    Orders
                                </Link>
                                <Link to="/account/keys" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    Keys
                                </Link>
                                <Link to="/account/settings" className="drawer-link" onClick={() => setIsMenuOpen(false)}>
                                    Settings
                                </Link>
                                <button className="drawer-sign-out" type="button" onClick={handleLogout}>
                                    Sign out
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
