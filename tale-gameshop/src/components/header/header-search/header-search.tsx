import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IGameService } from "../../../iterfaces/i-game-service";
import type { IUrlService } from "../../../iterfaces/i-url-service";
import { Game } from "../../../models/game";
import { useSitePreferences, formatMoney } from "../../../context/site-preferences";
import { slugify } from "../../../utils/slugify";
import SafeGameImage from "../../common/SafeGameImage";
import { analyticsClient } from "../../../utils/analytics-client";

// Header search with typeahead suggestions.
//
// Server-load design: the catalog is fetched AT MOST once per CACHE_TTL and only after the
// user actually starts typing — every keystroke after that filters in memory, so the typeahead
// adds zero extra requests compared to opening the Store page once. The debounce below only
// smooths the UI; it is not what protects the server.
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 220;
const MIN_QUERY_LENGTH = 2;
const MAX_SUGGESTIONS = 6;

let gamesCache: { at: number; promise: Promise<Game[]> } | null = null;

function getGamesCached(gameService: IGameService): Promise<Game[]> {
    const now = Date.now();
    if (gamesCache && now - gamesCache.at < CACHE_TTL_MS) {
        return gamesCache.promise;
    }
    const promise = gameService.getAllGames().catch(() => {
        gamesCache = null; // не кэшируем неудачу — следующий ввод попробует снова
        return [] as Game[];
    });
    gamesCache = { at: now, promise };
    return promise;
}

function rankMatches(games: Game[], query: string): Game[] {
    const q = query.toLowerCase();
    const starts: Game[] = [];
    const contains: Game[] = [];
    for (const game of games) {
        const title = (game.title || game.name || "").toLowerCase();
        if (!title) continue;
        if (title.startsWith(q)) {
            starts.push(game);
        } else if (title.includes(q)) {
            contains.push(game);
        }
        if (starts.length >= MAX_SUGGESTIONS) break;
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

interface HeaderSearchProps {
    variant?: "bar" | "drawer";
    /** Called after any navigation from the search (used to close the mobile drawer). */
    onNavigated?: () => void;
}

const HeaderSearch: React.FC<HeaderSearchProps> = ({ variant = "bar", onNavigated }) => {
    const navigate = useNavigate();
    const { currency } = useSitePreferences();
    const [value, setValue] = useState("");
    const [results, setResults] = useState<Game[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<number | null>(null);

    const gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
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
        if (query.length < MIN_QUERY_LENGTH) {
            setResults([]);
            close();
            return;
        }
        debounceRef.current = window.setTimeout(async () => {
            const games = await getGamesCached(gameService);
            const matches = rankMatches(games, query);
            setResults(matches);
            setActiveIndex(-1);
            setIsOpen(matches.length > 0);
        }, DEBOUNCE_MS);
    };

    const goToGame = (game: Game) => {
        const slug = game.slug ? slugify(game.slug) : slugify(game.title || game.name);
        close();
        onNavigated?.();
        navigate(`/games/${slug}`);
    };

    const goToCatalog = () => {
        const query = value.trim();
        close();
        onNavigated?.();

        // Событие поиска отправляем отсюда: это единственное место, где поиск
        // действительно происходит. У каталога своего поля больше нет — он лишь
        // показывает результат по параметру адреса.
        if (query.length >= MIN_QUERY_LENGTH) {
            analyticsClient.trackEvent("search", { search_term: query });
        }

        navigate(query ? `/games?filterName=${encodeURIComponent(query)}` : "/games");
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
        if (!isOpen || results.length === 0) {
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((prev) => (prev + 1) % results.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
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
                    placeholder="Search games…"
                    aria-label="Search games"
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-autocomplete="list"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (results.length > 0 && query.length >= MIN_QUERY_LENGTH) {
                            setIsOpen(true);
                        }
                    }}
                />
                {variant === "bar" && (
                    <button type="submit" className="header-search-submit">
                        Search
                    </button>
                )}
            </form>

            {isOpen && results.length > 0 && (
                <div
                    className="search-suggest"
                    role="listbox"
                    aria-label="Game suggestions"
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
                                <span className="search-suggest-thumb" aria-hidden="true">
                                    <SafeGameImage
                                        gameTitle={game.title}
                                        src={game.imagePath}
                                        baseUrl={urlService.apiBaseUrl}
                                        loading="lazy"
                                    />
                                </span>
                                <span className="search-suggest-title">{game.title}</span>
                                {hasDiscount && (
                                    <span className="search-suggest-badge">-{Math.round(Number(game.discountPercent))}%</span>
                                )}
                                <span className="search-suggest-price">{formatMoney(price, currency)}</span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        className="search-suggest-all"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(-1)}
                        onClick={goToCatalog}
                    >
                        See all results for “{query}”
                    </button>
                </div>
            )}
        </div>
    );
};

export default HeaderSearch;
