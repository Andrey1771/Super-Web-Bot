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
import { useWishlist } from '../../context/wishlist-context';
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
    const { state: wishlistState, toggleWishlist } = useWishlist();

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
        if (settingsCategories.length > 0) {
            const remaining = categoryOptions.filter((category) => !settingsCategories.includes(category));
            return [...settingsCategories, ...remaining];
        }

        return categoryOptions.length > 0 ? categoryOptions : categoryOrder;
    }, [settingsCategories, categoryOptions]);

    const settingsCategoryByTitle = useMemo(() => {
        const map = new Map<string, Settings['gameCategories'][number]>();
        settings?.gameCategories?.forEach((category) => {
            map.set(category.title, category);
        });
        return map;
    }, [settings]);

    useEffect(() => {
        setCollapsedMap((prev) => {
            const next = { ...prev };
            categoriesForDisplay.forEach((category) => {
                if (next[category] === undefined) {
                    const settingsCategory = settingsCategoryByTitle.get(category);
                    next[category] = settingsCategory?.collapsed ?? true;
                }
            });
            return next;
        });
    }, [categoriesForDisplay, settingsCategoryByTitle]);

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
        const isWishlisted = wishlistState.items.some((item) => item.gameId === (game.id ?? ''));

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
                    <button
                        type="button"
                        className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-lg shadow-sm transition ${
                            isWishlisted ? 'text-[#e2438c]' : 'text-[#b3a8dc]'
                        }`}
                        onClick={() =>
                            toggleWishlist({
                                gameId: game.id ?? '',
                                name: game.title,
                                price: game.price,
                                image: game.imagePath
                            })
                        }
                        aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={isWishlisted ? 'currentColor' : 'none'}>
                            <path
                                d="M12 20.5c-4.5-3.7-7.5-6.4-7.5-10a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 3.6-3 6.3-7.5 10l-0.5 0.4-0.5-0.4Z"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
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

    const iconFallbackMap: Record<string, 'cap' | 'bolt' | 'rpg' | 'strategy' | 'sports'> = {
        'Educational Games': 'cap',
        Action: 'bolt',
        'Role-Playing Games (RPGs)': 'rpg',
        Strategy: 'strategy',
        Sports: 'sports'
    };
    const iconKeyMap: Record<string, 'cap' | 'bolt' | 'rpg' | 'strategy' | 'sports'> = {
        cap: 'cap',
        bolt: 'bolt',
        rpg: 'rpg',
        strategy: 'strategy',
        sports: 'sports'
    };
    const resolveIcon = (category: string) => {
        const settingsIconKey = settingsCategoryByTitle.get(category)?.icon;
        const mappedKey = settingsIconKey ? iconKeyMap[settingsIconKey.toLowerCase()] : undefined;
        const fallbackKey = mappedKey ?? iconFallbackMap[category] ?? 'cap';
        return <CategoryIcon variant={fallbackKey} />;
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
                                            {resolveIcon(category)}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-semibold text-[#2b2350]">{category}</h2>
                                            {description && <p className="mt-1 text-sm text-[#6f64a8]">{description}</p>}
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

                <section className="mt-12 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0b0d1f_0%,#1a1634_45%,#3b1d78_100%)] px-8 py-12 text-white shadow-[0_28px_60px_rgba(29,20,64,0.35)]">
                    <div className="mx-auto max-w-3xl text-center">
                        <h2 className="text-3xl font-semibold md:text-4xl">Discover your next favourite game</h2>
                        <p className="mt-3 text-sm text-white/70 md:text-base">
                            Explore collections &amp; discover new favorites with our curated recommendations.
                        </p>
                    </div>
                    <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                        {[
                            {
                                title: 'Best Deals',
                                subtitle: 'of the Week',
                                action: 'View Deals',
                                badge: '25% OFF',
                                buttonClass: 'bg-[#6b3ff2] text-white shadow-[0_12px_24px_rgba(107,63,242,0.4)]',
                                imageClass: 'bg-[linear-gradient(135deg,#2f2b56_0%,#6041a8_50%,#f2a674_100%)]'
                            },
                            {
                                title: 'Newly Added',
                                subtitle: 'Games',
                                action: 'See New',
                                badge: null,
                                buttonClass: 'bg-white text-[#3c2b78] shadow-[0_12px_24px_rgba(255,255,255,0.16)]',
                                imageClass: 'bg-[linear-gradient(135deg,#1a213f_0%,#4e6dc8_45%,#99c4ff_100%)]'
                            },
                            {
                                title: 'Top Rated',
                                subtitle: 'Picks',
                                action: 'Browse Top Rated',
                                badge: null,
                                buttonClass: 'bg-[#6b3ff2] text-white shadow-[0_12px_24px_rgba(107,63,242,0.4)]',
                                imageClass: 'bg-[linear-gradient(135deg,#231c3a_0%,#5a4b8a_45%,#f0b07a_100%)]'
                            },
                            {
                                title: 'Your Personal',
                                subtitle: 'Picks',
                                action: 'See For You',
                                badge: null,
                                buttonClass: 'bg-white text-[#3c2b78] shadow-[0_12px_24px_rgba(255,255,255,0.16)]',
                                imageClass: 'bg-[linear-gradient(135deg,#1c2544_0%,#5b69b2_40%,#b7c9f1_100%)]'
                            }
                        ].map((card) => (
                            <div
                                key={card.title}
                                className="relative flex min-h-[250px] flex-col justify-end overflow-hidden rounded-[22px] border border-white/10 bg-white/5 px-5 py-5 shadow-[0_20px_40px_rgba(10,8,30,0.45)]"
                            >
                                <div className={`absolute inset-0 opacity-95 ${card.imageClass}`} />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d1f]/80 via-[#0b0d1f]/30 to-transparent" />
                                {card.badge && (
                                    <span className="relative z-10 inline-flex w-max rounded-full bg-[#6b3ff2] px-3 py-1 text-xs font-semibold shadow-sm">
                                        {card.badge}
                                    </span>
                                )}
                                <div className="relative z-10 mt-3 space-y-1">
                                    <h3 className="text-xl font-semibold">{card.title}</h3>
                                    <p className="text-base text-white/85">{card.subtitle}</p>
                                </div>
                                <button className={`relative z-10 mt-5 w-max rounded-[12px] px-4 py-2 text-sm font-semibold ${card.buttonClass}`}>
                                    {card.action}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-12">
                    <div className="max-w-2xl">
                        <h2 className="text-2xl font-semibold text-[#2b2350]">Loved by players,</h2>
                        <p className="mt-1 text-lg text-[#6f64a8]">trusted by hundreds of thousands</p>
                    </div>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            {
                                title: 'Secure payments',
                                description: 'Safe payment methods you can trust.',
                                icon: (
                                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#6b3ff2]" fill="none">
                                        <path d="M6 10V7a6 6 0 1 1 12 0v3" stroke="currentColor" strokeWidth="1.6" />
                                        <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
                                    </svg>
                                )
                            },
                            {
                                title: 'Instant delivery',
                                description: 'Get your purchased games instantly.',
                                icon: (
                                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#6b3ff2]" fill="none">
                                        <path d="M5 12h6l-2-3m2 3-2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                        <path d="M13 7h5l1 5h-6V7Z" stroke="currentColor" strokeWidth="1.6" />
                                    </svg>
                                )
                            },
                            {
                                title: 'Curated picks',
                                description: 'Hand-picked collections & recommendations.',
                                icon: (
                                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#6b3ff2]" fill="none">
                                        <path d="m6 12 4 4 8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                        <path d="M8 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                )
                            },
                            {
                                title: 'Friendly support',
                                description: "We’re here to help you 24/7.",
                                icon: (
                                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#6b3ff2]" fill="none">
                                        <path d="M4 11a8 8 0 1 1 16 0v5a3 3 0 0 1-3 3h-2" stroke="currentColor" strokeWidth="1.6" />
                                        <path d="M7 11h2v4H7a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3Z" stroke="currentColor" strokeWidth="1.6" />
                                    </svg>
                                )
                            }
                        ].map((feature) => (
                            <div
                                key={feature.title}
                                className="rounded-[18px] border border-[#efeaff] bg-white/90 p-4 shadow-[0_12px_24px_rgba(108,85,164,0.12)]"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#f0ebff]">
                                    {feature.icon}
                                </div>
                                <h3 className="mt-4 text-base font-semibold text-[#2b2350]">{feature.title}</h3>
                                <p className="mt-2 text-sm text-[#6f64a8]">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-10 rounded-[22px] border border-[#ece8ff] bg-white/80 p-6 shadow-[0_18px_36px_rgba(108,85,164,0.14)]">
                    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl font-semibold text-[#2b2350]">4.8</span>
                                <div className="flex items-center gap-1 text-[#6b3ff2]">
                                    {Array.from({ length: 5 }).map((_, index) => (
                                        <svg key={`rating-star-${index}`} viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                                            <path d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z" />
                                        </svg>
                                    ))}
                                </div>
                                <span className="text-sm text-[#6f64a8]">8,536 reviews</span>
                            </div>
                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                {[
                                    {
                                        name: 'Mat S.',
                                        initial: 'M',
                                        review: 'Awesome selection of PC games and super fast delivery!'
                                    },
                                    {
                                        name: 'Alex R.',
                                        initial: 'A',
                                        review: 'Great deals and instant keys, perfect for hassle-free gaming.'
                                    }
                                ].map((review) => (
                                    <div key={review.name} className="rounded-[16px] border border-[#efeaff] bg-white px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6b3ff2] text-sm font-semibold text-white">
                                                {review.initial}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-[#2b2350]">{review.name}</p>
                                                <div className="flex items-center gap-0.5 text-[#6b3ff2]">
                                                    {Array.from({ length: 5 }).map((_, index) => (
                                                        <svg key={`${review.name}-star-${index}`} viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor">
                                                            <path d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z" />
                                                        </svg>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-sm text-[#6f64a8]">{review.review}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-[16px] border border-[#efeaff] bg-[#fbf9ff] p-4">
                            <div className="space-y-2">
                                {[
                                    { label: '5', value: 78 },
                                    { label: '4', value: 15 },
                                    { label: '3', value: 5 },
                                    { label: '2', value: 1 },
                                    { label: '1', value: 1 }
                                ].map((rating) => (
                                    <div key={rating.label} className="flex items-center gap-3 text-sm text-[#6f64a8]">
                                        <span className="w-4 text-right font-semibold text-[#2b2350]">{rating.label}</span>
                                        <div className="flex flex-1 items-center gap-2">
                                            <div className="h-2 flex-1 rounded-full bg-[#e6e1ff]">
                                                <div
                                                    className="h-2 rounded-full bg-[#6b3ff2]"
                                                    style={{ width: `${rating.value}%` }}
                                                />
                                            </div>
                                            <span className="w-8 text-right text-xs text-[#6f64a8]">{rating.value}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#e6e1ff] bg-white px-4 py-2 text-xs font-semibold text-[#6b64a8]">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#6b3ff2] text-[10px] font-bold text-white">
                                    ★
                                </span>
                                Trustpilot
                            </button>
                        </div>
                    </div>
                </section>

                <section className="mt-12 overflow-hidden rounded-[26px]">
                    <div className="relative flex min-h-[260px] flex-col items-center justify-center rounded-[26px] bg-[linear-gradient(135deg,#141b33_0%,#3b2a69_55%,#2b1a49_100%)] px-6 py-12 text-center text-white shadow-[0_24px_48px_rgba(20,15,50,0.3)]">
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,16,40,0.35)_0%,rgba(54,38,100,0.55)_60%,rgba(20,16,40,0.85)_100%)]" />
                        <div className="relative z-10 max-w-2xl">
                            <h2 className="text-3xl font-semibold md:text-4xl">Not sure what to play?</h2>
                            <p className="mt-3 text-base text-white/80">Try curated picks based on genre and ratings.</p>
                            <div className="mt-6 flex flex-wrap justify-center gap-3">
                                <button className="rounded-[12px] bg-[#6b3ff2] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(107,63,242,0.35)]">
                                    See Top Rated
                                </button>
                                <button className="rounded-[12px] border border-white/30 bg-white/90 px-6 py-2.5 text-sm font-semibold text-[#3d2f74] shadow-[0_12px_24px_rgba(12,10,30,0.2)]">
                                    View Deals
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default TaleGameshopGameList;
