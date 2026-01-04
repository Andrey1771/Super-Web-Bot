import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import IDENTIFIERS from '../../constants/identifiers';
import './game-list-page.css';
import container from '../../inversify.config';
import { Game } from '../../models/game';
import type { IGameService } from '../../iterfaces/i-game-service';
import type { ISettingsService } from '../../iterfaces/i-settings-service';
import { Settings } from '../../models/settings';
import { useCart } from '../../context/cart-context';
import { Product } from '../../reducers/cart-reducer';
import type { IUrlService } from '../../iterfaces/i-url-service';

const categoryOrder = [
    'Educational Games',
    'Action',
    'Role-Playing Games (RPGs)',
    'Strategy',
    'Sports'
];

const TaleGameshopGameList: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [gamesByCategory, setGamesByCategory] = useState<Map<string, Game[]>>(new Map());
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchNameQuery, setSearchNameQuery] = useState<string>('');
    const [settings, setSettings] = useState<Settings | null>(null);
    const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { dispatch } = useCart();

    const _gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
    const _settingsService = container.get<ISettingsService>(IDENTIFIERS.ISettingsService);
    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    useEffect(() => {
        (async () => {
            const allSettings = await _settingsService.getAllSettings();
            const currentSettings = allSettings.shift() ?? null;
            setSettings(currentSettings);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            await loadGamesAndUpdateFilterCategory();
        })();
    }, [settings]);

    useEffect(() => {
        (async () => {
            await loadGamesAndUpdateFilterCategory();
        })();
    }, [location.search]);

    useEffect(() => {
        (async () => {
            await updateGamesByCategory(games);
        })();
    }, [searchQuery]);

    const loadGamesAndUpdateFilterCategory = async () => {
        const filterCategory = searchParams.get('filterCategory');
        setSearchQuery(filterCategory ?? '');

        const fetchedGames = await _gameService.getAllGames();
        setGames(fetchedGames);
        await updateGamesByCategory(fetchedGames);
    };

    const updateGamesByCategory = async (gamesList: Game[]) => {
        const updatedGamesByCategory = gamesList.reduce((acc, game) => {
            const category = settings?.gameCategories[game.gameType] ?? null;
            if (category === null) {
                return acc;
            }

            if (!acc.has(category.title)) {
                acc.set(category.title, []);
            }
            acc.get(category.title)!.push(game);
            return acc;
        }, new Map<string, Game[]>());

        setGamesByCategory(updatedGamesByCategory);
    };

    const updateSearchNameParams = (value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set('filterName', value);
        } else {
            params.delete('filterName');
        }
        setSearchParams(params);
        navigate(`?${params.toString()}`, { replace: true });
    };

    const updateSearchParams = (value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set('filterCategory', value);
        } else {
            params.delete('filterCategory');
        }
        setSearchParams(params);
        navigate(`?${params.toString()}`, { replace: true });
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearchNameQuery(value);
        updateSearchNameParams(value);
    };

    const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        setSearchQuery(value);
        updateSearchParams(value);
    };

    const clearAllFilters = () => {
        setSearchQuery('');
        setSearchNameQuery('');
        const params = new URLSearchParams(searchParams);
        params.delete('filterCategory');
        params.delete('filterName');
        setSearchParams(params);
        navigate(`?${params.toString()}`, { replace: true });
    };

    const filteredGamesByCategory = useMemo(() => {
        return new Map(
            Array.from(gamesByCategory.entries())
                .filter(([category]) => category.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((value: [string, Game[]]) => [
                    value.at(0),
                    (value.at(1) as Game[]).filter((game) => game.title.includes(searchNameQuery))
                ])
        );
    }, [gamesByCategory, searchQuery, searchNameQuery]);

    const categoryOptions = Array.from(gamesByCategory.keys());
    const settingsCategories = settings?.gameCategories?.map((category) => category.title) ?? [];
    const categoriesForDisplay = useMemo(() => {
        const availableCategories = settingsCategories.length > 0 ? settingsCategories : categoryOptions;
        const ordered = categoryOrder.filter((category) => availableCategories.includes(category));
        const remaining = availableCategories.filter((category) => !categoryOrder.includes(category));
        return [...ordered, ...remaining];
    }, [settingsCategories, categoryOptions]);

    useEffect(() => {
        const defaultCollapsed = new Set(['Strategy', 'Sports']);
        setCollapsedMap((prev) => {
            const next = { ...prev };
            categoriesForDisplay.forEach((category) => {
                if (next[category] === undefined) {
                    next[category] = defaultCollapsed.has(category);
                }
            });
            return next;
        });
    }, [categoriesForDisplay]);

    const handleAddToCart = (game: Game) => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: game.id ?? '',
                name: game.name,
                price: game.price,
                quantity: 1,
                image: game.imagePath
            } as Product
        });
    };

    const renderImage = (game: Game) => {
        if (game.imagePath) {
            return (
                <img
                    alt={game.title}
                    className="h-full w-full object-cover"
                    src={`${urlService.apiBaseUrl}/${game.imagePath}`}
                />
            );
        }

        return (
            <div className="h-full w-full bg-[linear-gradient(135deg,#c7bfff_0%,#e8e1ff_45%,#f7f4ff_100%)]" />
        );
    };

    const CategoryIcon = ({ variant }: { variant: 'cap' | 'bolt' | 'rpg' | 'strategy' | 'sports' }) => {
        const baseClass = 'h-8 w-8 text-[#6b3ff2]';
        if (variant === 'cap') {
            return (
                <svg className={baseClass} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M4 9.5L12 5l8 4.5-8 4.5-8-4.5Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                    />
                    <path d="M6 12.8v4.2c0 1.1 3 2 6 2s6-.9 6-2v-4.2" stroke="currentColor" strokeWidth="1.6" />
                </svg>
            );
        }
        if (variant === 'bolt') {
            return (
                <svg className={baseClass} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M13.2 2.8 6 13.4h4.8l-1 7.8L18 10.6h-5.1l.3-7.8Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                    />
                </svg>
            );
        }
        if (variant === 'rpg') {
            return (
                <svg className={baseClass} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 3.5 4 7.7v8.6l8 4.2 8-4.2V7.7L12 3.5Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                    />
                    <path d="m12 8.2 3.2 3.4-3.2 3.4-3.2-3.4 3.2-3.4Z" stroke="currentColor" strokeWidth="1.6" />
                </svg>
            );
        }
        if (variant === 'strategy') {
            return (
                <svg className={baseClass} viewBox="0 0 24 24" fill="none">
                    <path d="M7 5h10v4H7V5Z" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M5 10.8h14v7.2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7.2Z" stroke="currentColor" strokeWidth="1.6" />
                </svg>
            );
        }
        return (
            <svg className={baseClass} viewBox="0 0 24 24" fill="none">
                <path d="M6 7h12v7a6 6 0 0 1-12 0V7Z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M9 5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        );
    };

    const CatalogCard = ({ game, variant, showBadge }: { game: Game; variant: 'large' | 'small'; showBadge?: boolean }) => {
        const isLarge = variant === 'large';
        const price = Number.isFinite(game.price) ? `$${Number(game.price).toFixed(2)}` : '$0';

        return (
            <div
                className={`relative flex h-full flex-col rounded-[20px] border border-[#ece8ff] bg-white/90 p-4 shadow-[0_12px_30px_rgba(84,58,193,0.08)] ${
                    isLarge ? 'md:p-5' : ''
                }`}
            >
                <div
                    className={`relative mb-4 overflow-hidden rounded-[16px] ${
                        isLarge ? 'h-[190px]' : 'h-[120px]'
                    }`}
                >
                    {renderImage(game)}
                    {showBadge && (
                        <span className="absolute left-3 top-3 rounded-full bg-[#6b3ff2] px-3 py-1 text-xs font-semibold text-white shadow-sm">
                            New
                        </span>
                    )}
                </div>
                <div className="flex flex-1 flex-col">
                    <h3 className={`${isLarge ? 'text-lg' : 'text-sm'} font-semibold text-[#2c2354]`}>
                        {game.title}
                    </h3>
                    <span className="mt-1 text-sm font-medium text-[#6f64a8]">{price}</span>
                    <button
                        className={`mt-auto w-full rounded-[12px] border border-[#d9d3ff] bg-[#6b3ff2] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(107,63,242,0.25)] transition hover:brightness-110 ${
                            isLarge ? 'mt-6' : 'mt-4'
                        }`}
                        onClick={() => handleAddToCart(game)}
                    >
                        Add to Cart
                    </button>
                </div>
            </div>
        );
    };

    const categoryMeta: Record<string, { icon: React.ReactNode }> = {
        'Educational Games': {
            icon: <CategoryIcon variant="cap" />
        },
        Action: {
            icon: <CategoryIcon variant="bolt" />
        },
        'Role-Playing Games (RPGs)': {
            icon: <CategoryIcon variant="rpg" />
        },
        Strategy: {
            icon: <CategoryIcon variant="strategy" />
        },
        Sports: {
            icon: <CategoryIcon variant="sports" />
        }
    };
    const categoryDescriptions = useMemo(() => {
        const descriptions = new Map<string, string>();
        settings?.gameCategories?.forEach((category) => {
            if (category.description) {
                descriptions.set(category.title, category.description);
            }
        });
        return descriptions;
    }, [settings]);

    return (
        <div className="min-h-screen bg-[#f6f2fb] text-[#2b2350]">
            <div className="pointer-events-none fixed left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(204,190,255,0.55)_0%,rgba(246,242,251,0.1)_70%)] blur-3xl" />
            <main className="container relative z-10 px-4 pb-24 pt-[140px]">
                <div className="mx-auto max-w-3xl text-center">
                    <h1 className="text-4xl font-semibold text-[#2b2350] sm:text-5xl">Game Catalog</h1>
                    <p className="mt-4 text-base text-[#6c6393]">
                        Discover and explore games across all genres. Use filters to quickly find what you're
                        looking for.
                    </p>
                </div>

                <div className="mt-10 rounded-[22px] border border-[#ece8ff] bg-white/80 p-5 shadow-[0_18px_38px_rgba(92,69,160,0.12)] backdrop-blur">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-1 flex-wrap items-center gap-3">
                            <label className="relative flex w-full max-w-[260px] items-center rounded-[14px] border border-[#e6e1ff] bg-white px-4 py-2 text-sm text-[#6b64a8] shadow-sm">
                                <span className="mr-2 text-[#9b92c4]">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
                                        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    className="w-full bg-transparent text-sm text-[#5a5286] placeholder:text-[#b0a7d4] focus:outline-none"
                                    placeholder="Search games..."
                                    value={searchNameQuery}
                                    onChange={handleSearchChange}
                                />
                            </label>

                            <div className="relative">
                                <select
                                    className="h-10 rounded-[14px] border border-[#e6e1ff] bg-white px-4 pr-8 text-sm font-medium text-[#5a5286] shadow-sm focus:outline-none"
                                    value={searchQuery}
                                    onChange={handleCategoryChange}
                                >
                                    <option value="">All categories</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category} value={category}>
                                            {category}
                                        </option>
                                    ))}
                                </select>
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9b92c4]">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                </span>
                            </div>

                            <div className="relative">
                                <select className="h-10 rounded-[14px] border border-[#e6e1ff] bg-white px-4 pr-8 text-sm font-medium text-[#5a5286] shadow-sm focus:outline-none">
                                    <option>Any price</option>
                                </select>
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9b92c4]">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                </span>
                            </div>

                            <div className="relative">
                                <select className="h-10 rounded-[14px] border border-[#e6e1ff] bg-white px-4 pr-8 text-sm font-medium text-[#5a5286] shadow-sm focus:outline-none">
                                    <option>All platforms</option>
                                </select>
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9b92c4]">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                </span>
                            </div>

                            <div className="relative">
                                <select className="h-10 rounded-[14px] border border-[#e6e1ff] bg-white px-4 pr-8 text-sm font-medium text-[#5a5286] shadow-sm focus:outline-none">
                                    <option>Sort by: Most Popular</option>
                                </select>
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9b92c4]">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                className="flex items-center gap-2 rounded-[12px] border border-[#e6e1ff] bg-white px-4 py-2 text-sm font-semibold text-[#6b64a8] shadow-sm"
                                onClick={clearAllFilters}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                    <path
                                        d="M7 7h10l-3 4v5l-4 2v-7L7 7Z"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                                Reset
                            </button>
                            <button className="rounded-[12px] bg-[#6b3ff2] px-5 py-2 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(107,63,242,0.28)]">
                                Apply Filters
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            className="rounded-full border border-[#e6e1ff] bg-white px-3 py-1.5 text-xs font-semibold text-[#6b64a8]"
                            onClick={clearAllFilters}
                        >
                            Reset
                        </button>
                        <button className="rounded-full border border-[#e6e1ff] bg-white px-3 py-1.5 text-xs font-semibold text-[#6b64a8]">
                            Under $20
                        </button>
                        <button
                            className="rounded-full border border-[#e6e1ff] bg-white px-3 py-1.5 text-xs font-semibold text-[#6b64a8]"
                            onClick={clearAllFilters}
                        >
                            Clear all
                        </button>
                    </div>
                </div>

                <div className="mt-10 space-y-6">
                    {categoriesForDisplay.map((category, index) => {
                        const meta = categoryMeta[category];
                        const isCollapsed = collapsedMap[category] ?? false;
                        const description = categoryDescriptions.get(category);
                        const displayGames = filteredGamesByCategory.get(category) ?? [];
                        const isFirstSection = index === 0;

                        return (
                            <section
                                key={category}
                                className="rounded-[22px] border border-[#ece8ff] bg-white/70 p-6 shadow-[0_16px_34px_rgba(97,75,164,0.1)]"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#f0ebff]">
                                            {meta?.icon}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-semibold text-[#2b2350]">{category}</h2>
                                            {description && (
                                                <p className="mt-1 text-sm text-[#6f64a8]">{description}</p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6e1ff] bg-white text-[#6b64a8] shadow-sm transition hover:border-[#cfc6ff]"
                                        onClick={() =>
                                            setCollapsedMap((prev) => ({ ...prev, [category]: !isCollapsed }))
                                        }
                                        aria-label={isCollapsed ? 'Expand category' : 'Collapse category'}
                                    >
                                        <svg
                                            className={`h-3 w-3 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                                            viewBox="0 0 24 24"
                                            fill="none"
                                        >
                                            <path
                                                d="m6 9 6 6 6-6"
                                                stroke="currentColor"
                                                strokeWidth="1.6"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                    </button>
                                </div>

                                {!isCollapsed && (
                                    <div
                                        className={`mt-6 grid gap-5 ${
                                            isFirstSection
                                                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
                                                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                                        }`}
                                    >
                                        {displayGames.map((game, gameIndex) => {
                                            const showLarge = isFirstSection && gameIndex === 0;
                                            const cardVariant = showLarge ? 'large' : 'small';
                                            const badge = showLarge && game.title === 'Elden Ring';
                                            const cardSpan = showLarge ? 'lg:col-span-2 md:col-span-2' : '';

                                            return (
                                                <div key={`${category}-${game.id ?? gameIndex}`} className={cardSpan}>
                                                    <CatalogCard game={game} variant={cardVariant} showBadge={badge} />
                                                </div>
                                            );
                                        })}
                                        {displayGames.length === 0 && (
                                            <div className="col-span-full rounded-[16px] border border-dashed border-[#e6e1ff] bg-white/70 py-8 text-center text-sm text-[#8a81b5]">
                                                No games available yet.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>

                <div className="mt-10 flex justify-center">
                    <button className="rounded-full border border-[#e6e1ff] bg-white px-8 py-3 text-sm font-semibold text-[#6b64a8] shadow-sm">
                        Load More
                    </button>
                </div>
            </main>
        </div>
    );
};

export default TaleGameshopGameList;
