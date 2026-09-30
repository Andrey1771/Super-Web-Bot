import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import type { IUrlService } from "../../../iterfaces/i-url-service";
import { Game } from "../../../models/game";
import { useSitePreferences, formatMoney } from "../../../context/site-preferences";
import { catalogHref, isSoftware, productHref } from "../../../utils/software";
import Cover from "../../common/Cover";
import { analyticsClient } from "../../../utils/analytics-client";

// Header search with typeahead suggestions.
//
// Нагрузка на сервер: запрос уходит не раньше двух введённых символов и не чаще, чем раз
// в DEBOUNCE_MS, а ответ — не больше MAX_SUGGESTIONS строк. Повторный ввод того же слова
// берётся из кэша вкладки. Каталог целиком не скачивается никогда.
const DEBOUNCE_MS = 220;

/**
 * С какого символа есть смысл предлагать конкретные игры.
 *
 * По одной букве совпадений слишком много, и шесть строк из пятнадцати — это не подсказка,
 * а случайная выборка. Поэтому на одном символе список не запрашивается, но и не молчит:
 * вместо игр показывается строка «искать во всём каталоге». Раньше при одной букве не
 * появлялось ничего, и поиск выглядел сломанным — хотя Enter работал и тогда.
 */
const MIN_SUGGEST_LENGTH = 2;
const MAX_SUGGESTIONS = 6;

/**
 * Поиск идёт на сервер, а не по скачанному каталогу.
 *
 * Раньше подсказки строились так: один раз скачать ВЕСЬ каталог (`getAllGames`), положить
 * в модульный кэш и фильтровать в памяти. На полусотне игр незаметно, но каталог магазина
 * растёт: на 10 000 игр это около 6.4 МБ, которые качает каждый посетитель, едва тронув
 * поле поиска. Плюс кэш устаревал — новые игры не находились до перезагрузки вкладки.
 *
 * `/api/game/catalog` умеет искать сам: отдаёт ровно нужные совпадения и считает релевантность
 * на своей стороне.
 */
/**
 * Результат подсказки: товары обоих видов (игры и ПО) и сколько совпадений у каждого вида — по нему
 * «See all results» ведёт в тот раздел, где их больше.
 */
type SearchResult = { items: Game[]; softwareMatches: number; gameMatches: number };

const searchCache = new Map<string, SearchResult>();

async function searchGames(query: string): Promise<SearchResult> {
    const key = query.toLowerCase();
    const cached = searchCache.get(key);
    if (cached) {
        return cached;
    }
    try {
        const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
        // Один поиск на весь магазин: kind=all отдаёт и игры, и ПО.
        const response = await apiClient.api.get(
            `/api/game/catalog?page=1&pageSize=${MAX_SUGGESTIONS}&kind=all&q=${encodeURIComponent(query)}`
        );
        const kinds = (response.data?.facets?.kinds ?? []) as { value: string; count: number }[];
        const result: SearchResult = {
            items: (response.data?.items ?? []) as Game[],
            softwareMatches: kinds.find((kind) => kind.value === "Software")?.count ?? 0,
            gameMatches: kinds.find((kind) => kind.value === "Game")?.count ?? 0,
        };
        // Кэш на время жизни вкладки: повторный ввод того же слова не идёт на сервер снова.
        // Неудачу не кэшируем — следующий ввод попробует ещё раз.
        searchCache.set(key, result);
        return result;
    } catch {
        return { items: [], softwareMatches: 0, gameMatches: 0 };
    }
}

interface HeaderSearchProps {
    variant?: "bar" | "drawer";
    /** Called after any navigation from the search (used to close the mobile drawer). */
    onNavigated?: () => void;
}

const HeaderSearch: React.FC<HeaderSearchProps> = ({ variant = "bar", onNavigated }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { currency } = useSitePreferences();
    const [value, setValue] = useState("");
    const [results, setResults] = useState<Game[]>([]);
    // ПО совпало больше, чем игр, — «See all results» ведёт в /software.
    const [preferSoftware, setPreferSoftware] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<number | null>(null);

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    const close = useCallback(() => {
        setIsOpen(false);
        setActiveIndex(-1);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const onOutside = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                close();
            }
        };
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
    }, [close, isOpen]);

    useEffect(() => () => {
        if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
        }
    }, []);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value;
        setValue(next);
        if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
        }
        const query = next.trim();
        if (query.length === 0) {
            setResults([]);
            close();
            return;
        }

        setActiveIndex(-1);
        if (query.length < MIN_SUGGEST_LENGTH) {
            // Одна буква: игр не предлагаем, но список открываем — в нём будет строка
            // «искать во всём каталоге», то есть ответ вместо пустоты.
            setResults([]);
            setPreferSoftware(false);
            setIsOpen(true);
            return;
        }

        debounceRef.current = window.setTimeout(async () => {
            const matches = await searchGames(query);
            setResults(matches.items);
            setPreferSoftware(matches.softwareMatches > matches.gameMatches);
            setActiveIndex(-1);
            // Открываем и когда ничего не нашлось: строка перехода в каталог полезнее
            // молчания — там есть фильтры, которыми можно поискать иначе.
            setIsOpen(true);
        }, DEBOUNCE_MS);
    };

    const goToGame = (game: Game) => {
        close();
        onNavigated?.();
        navigate(productHref(game));
    };

    const goToCatalog = () => {
        const query = value.trim();
        close();
        onNavigated?.();

        // Событие поиска отправляем отсюда: это единственное место, где поиск
        // действительно происходит. У каталога своего поля больше нет — он лишь
        // показывает результат по параметру адреса.
        if (query.length > 0) {
            analyticsClient.trackEvent("search", { search_term: query });
        }

        navigate(catalogHref(preferSoftware, query ? { filterName: query } : {}));
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
            goToGame(results[activeIndex]);
        } else {
            goToCatalog();
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen) {
            return;
        }
        // Строк на одну больше, чем игр: последняя — переход в каталог. Индекс, равный
        // results.length, и есть она; handleSubmit на таком индексе не найдёт игру и
        // уведёт в каталог — то, что нужно.
        const rows = results.length + 1;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((prev) => (prev + 1) % rows);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((prev) => (prev <= 0 ? rows - 1 : prev - 1));
        } else if (event.key === "Escape") {
            close();
        }
    };

    const query = value.trim();

    return (
        <div className={`header-search-box ${variant === "drawer" ? "is-drawer" : ""}`} ref={rootRef}>
            <form
                className={variant === "drawer" ? "drawer-search" : "header-search"}
                role="search"
                onSubmit={handleSubmit}
            >
                <svg className="header-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input
                    type="search"
                    className="header-search-input"
                    placeholder={t("search.placeholder")}
                    aria-label={t("search.label")}
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-autocomplete="list"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (query.length > 0) {
                            setIsOpen(true);
                        }
                    }}
                />
                {variant === "bar" && (
                    <button type="submit" className="header-search-submit">
                        {t("common.search")}
                    </button>
                )}
            </form>

            {/* Список открыт с первого символа. Игр в нём может не быть — тогда в нём одна
                строка перехода в каталог, и это всё равно ответ, а не пустота. */}
            {isOpen && query.length > 0 && (
                <div
                    className="search-suggest"
                    role="listbox"
                    aria-label={t("search.suggestions")}
                    onMouseLeave={() => setActiveIndex(-1)}
                >
                    {results.map((game, index) => {
                        const price = Number.isFinite(game.finalPrice ?? game.price)
                            ? Number(game.finalPrice ?? game.price)
                            : Number(game.price) || 0;
                        const hasDiscount = Boolean(
                            game.discountActive && game.discountPercent && game.discountPercent > 0
                        );
                        return (
                            <button
                                key={game.id ?? `${game.title}-${index}`}
                                type="button"
                                role="option"
                                aria-selected={index === activeIndex}
                                className={`search-suggest-item ${index === activeIndex ? "is-active" : ""}`}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => goToGame(game)}
                            >
                                <Cover as="span" className="search-suggest-thumb" ratio="wide" sizes="46px" widths={[240]} title={game.title} src={game.imagePath} baseUrl={urlService.apiBaseUrl} />
                                <span className="search-suggest-title">{game.title}</span>
                                {/* Поиск общий — вид товара помечаем, чтобы «Nova Drift» и «Nova Security» не путались. */}
                                {isSoftware(game.kind) && <span className="search-suggest-kind">{t("common.software")}</span>}
                                {hasDiscount && (
                                    <span className="search-suggest-badge">-{Math.round(Number(game.discountPercent))}%</span>
                                )}
                                <span className="search-suggest-price">{formatMoney(price, currency)}</span>
                            </button>
                        );
                    })}
                    {/* Последняя строка списка, а не довесок под ним: стрелками до неё
                        доходят так же, как до игр, и Enter на ней уводит в каталог. */}
                    <button
                        type="button"
                        role="option"
                        aria-selected={activeIndex === results.length}
                        className={`search-suggest-all ${activeIndex === results.length ? "is-active" : ""}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(results.length)}
                        onClick={goToCatalog}
                    >
                        {results.length > 0
                            ? t("search.seeAllResults", { query })
                            : t("search.searchCatalog", { query })}
                    </button>
                </div>
            )}
        </div>
    );
};

export default HeaderSearch;
