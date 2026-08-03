import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import type { IKeycloakService } from '../../iterfaces/i-keycloak-service';
import type { IRecommendationsService } from '../../iterfaces/i-recommendations-service';
import { analyticsClient } from '../../utils/analytics-client';
import { slugify } from '../../utils/slugify';
import SafeGameImage from '../common/SafeGameImage';

const categoryOrder = [
    'Educational Games',
    'Action',
    'Role-Playing Games (RPGs)',
    'Strategy',
    'Sports'
];

const TaleGameshopGameList: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [collapsedOverrides, setCollapsedOverrides] = useState<Record<string, boolean>>({});
    const [searchParams, setSearchParams] = useSearchParams();
    const { dispatch } = useCart();
    const { isWishlisted, toggle: toggleWishlist } = useWishlist();

    const services = useMemo(
        () => ({
            gameService: container.get<IGameService>(IDENTIFIERS.IGameService),
            settingsService: container.get<ISettingsService>(IDENTIFIERS.ISettingsService),
            urlService: container.get<IUrlService>(IDENTIFIERS.IUrlService),
            keycloakService: container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService),
            recommendationsService: container.get<IRecommendationsService>(IDENTIFIERS.IRecommendationsService)
        }),
        []
    );

    const filterCategory = searchParams.get('filterCategory') ?? '';
    const filterName = searchParams.get('filterName') ?? '';
    const [searchNameDraft, setSearchNameDraft] = useState(filterName);
    const searchTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        setSearchNameDraft(filterName);
    }, [filterName]);

    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                window.clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        (async () => {
            const allSettings = await services.settingsService.getAllSettings();
            const currentSettings = allSettings.shift() ?? null;
            setSettings(currentSettings);
        })();
    }, [services.settingsService]);

    useEffect(() => {
        (async () => {
            const fetchedGames = await services.gameService.getAllGames();
            setGames(fetchedGames);
        })();
    }, [services.gameService]);

    const patchSearchParams = useCallback(
        (patchFn: (params: URLSearchParams) => void) => {
            const params = new URLSearchParams(searchParams);
            patchFn(params);
            setSearchParams(params);
        },
        [searchParams, setSearchParams]
    );

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearchNameDraft(value);
        patchSearchParams((params) => {
            if (value) {
                params.set('filterName', value);
            } else {
                params.delete('filterName');
            }
        });

        if (searchTimeoutRef.current) {
            window.clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = window.setTimeout(() => {
            if (value.trim().length >= 2) {
                analyticsClient.trackEvent('search', { search_term: value.trim() });
            }
        }, 600);
    };

    const setCategoryFilter = (value: string) => {
        patchSearchParams((params) => {
            if (value) {
                params.set('filterCategory', value);
            } else {
                params.delete('filterCategory');
            }
        });
    };

    const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setCategoryFilter(event.target.value);
    };

    const clearAllFilters = () => {
        setSearchNameDraft('');
        patchSearchParams((params) => {
            params.delete('filterCategory');
            params.delete('filterName');
            params.delete('filterMinPrice');
            params.delete('filterMaxPrice');
            params.delete('sortBy');
            params.delete('page');
            params.delete('platforms');
        });
    };

    const settingsCategoryByTitle = useMemo(() => {
        const map = new Map<string, Settings['gameCategories'][number]>();
        settings?.gameCategories?.forEach((category) => {
            map.set(category.title, category);
        });
        return map;
    }, [settings]);

    const gamesByCategory = useMemo(() => {
        return games.reduce((acc, game) => {
            const category = settings?.gameCategories[game.gameType] ?? null;
            if (!category) {
                return acc;
            }

            if (!acc.has(category.title)) {
                acc.set(category.title, []);
            }
            acc.get(category.title)!.push(game);
            return acc;
        }, new Map<string, Game[]>());
    }, [games, settings]);

    const filteredGamesByCategory = useMemo(() => {
        const normalizedCategoryFilter = filterCategory.toLowerCase();
        const normalizedNameFilter = filterName.toLowerCase();

        return new Map(
            Array.from(gamesByCategory.entries())
                .filter(([category]) => category.toLowerCase().includes(normalizedCategoryFilter))
                .map(([category, categoryGames]) => [
                    category,
                    categoryGames.filter((game) =>
                        normalizedNameFilter ? game.title.toLowerCase().includes(normalizedNameFilter) : true
                    )
                ])
        );
    }, [gamesByCategory, filterCategory, filterName]);

    const categoryOptions = useMemo(() => Array.from(gamesByCategory.keys()), [gamesByCategory]);
    const settingsCategories = useMemo(
        () => settings?.gameCategories?.map((category) => category.title) ?? [],
        [settings]
    );
    const categoriesForDisplay = useMemo(() => {
        if (settingsCategories.length > 0) {
            const remaining = categoryOptions.filter((category) => !settingsCategories.includes(category));
            return [...settingsCategories, ...remaining];
        }

        return categoryOptions.length > 0 ? categoryOptions : categoryOrder;
    }, [settingsCategories, categoryOptions]);

    const extractPlatformsFromGame = useCallback((game: Game) => {
        const gameWithPlatforms = game as Game & {
            platform?: string;
            platforms?: string[] | string;
            supportedPlatforms?: string[] | string;
        };

        const normalizeValue = (value: string) =>
            value
                .split(/[;,/]/)
                .map((item) => item.trim())
                .filter(Boolean);

        const values: string[] = [];

        if (typeof gameWithPlatforms.platform === 'string') {
            values.push(...normalizeValue(gameWithPlatforms.platform));
        }

        if (Array.isArray(gameWithPlatforms.platforms)) {
            values.push(...gameWithPlatforms.platforms.map((item) => item.trim()).filter(Boolean));
        } else if (typeof gameWithPlatforms.platforms === 'string') {
            values.push(...normalizeValue(gameWithPlatforms.platforms));
        }

        if (Array.isArray(gameWithPlatforms.supportedPlatforms)) {
            values.push(...gameWithPlatforms.supportedPlatforms.map((item) => item.trim()).filter(Boolean));
        } else if (typeof gameWithPlatforms.supportedPlatforms === 'string') {
            values.push(...normalizeValue(gameWithPlatforms.supportedPlatforms));
        }

        return Array.from(new Set(values));
    }, []);

    const availablePlatforms = useMemo(() => {
        const platformValues = new Set<string>();
        games.forEach((game) => {
            extractPlatformsFromGame(game).forEach((platform) => platformValues.add(platform));
        });
        return Array.from(platformValues).sort((a, b) => a.localeCompare(b));
    }, [extractPlatformsFromGame, games]);

    const availablePrices = useMemo(() => {
        const prices = games
            .map((game) => Number(game.finalPrice ?? game.price))
            .filter((price) => Number.isFinite(price) && price >= 0);
        const min = prices.length > 0 ? Math.floor(Math.min(...prices)) : 0;
        const max = prices.length > 0 ? Math.ceil(Math.max(...prices)) : 100;
        return { min, max };
    }, [games]);

    const selectedPlatforms = useMemo(() => {
        return (searchParams.get('platforms') ?? '')
            .split(',')
            .map((platform) => platform.trim())
            .filter(Boolean);
    }, [searchParams]);

    const minPriceFilter = Number(searchParams.get('filterMinPrice') ?? availablePrices.min);
    const maxPriceFilter = Number(searchParams.get('filterMaxPrice') ?? availablePrices.max);
    const sortBy = searchParams.get('sortBy') ?? 'popular';
    const currentPage = Math.max(1, Number(searchParams.get('page') ?? 1));

    const getCollapsed = useCallback(
        (category: string) => {
            if (collapsedOverrides[category] !== undefined) {
                return collapsedOverrides[category];
            }
            return settingsCategoryByTitle.get(category)?.collapsed ?? true;
        },
        [collapsedOverrides, settingsCategoryByTitle]
    );

    const toggleCollapsed = useCallback((category: string) => {
        setCollapsedOverrides((prev) => {
            const current = prev[category] ?? (settingsCategoryByTitle.get(category)?.collapsed ?? true);
            return { ...prev, [category]: !current };
        });
    }, [settingsCategoryByTitle]);

    const handleAddToCart = (game: Game) => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: game.id ?? '',
                name: game.title ?? game.name,
                price: game.finalPrice ?? game.price,
                quantity: 1,
                image: game.imagePath
            } as Product
        });
    };

    const handleRecordViewed = useCallback(
        async (game: Game) => {
            if (!game.id) {
                return;
            }

            if (!services.keycloakService.keycloak?.authenticated) {
                return;
            }

            try {
                await services.recommendationsService.postViewed(game.id, 'catalog');
            } catch (error) {
                console.error('Failed to record viewed game:', error);
            }
        },
        [services.recommendationsService]
    );

    const renderImage = (game: Game) => (
        <SafeGameImage
            gameTitle={game.title}
            src={game.imagePath}
            baseUrl={services.urlService.apiBaseUrl}
            className="h-full w-full object-cover pointer-events-none"
            loading="lazy"
        />
    );


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
        const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
        const finalPrice = Number.isFinite(game.finalPrice ?? game.price) ? Number(game.finalPrice ?? game.price) : regularPrice;
        const hasActiveDiscount = Boolean(game.discountActive && game.discountPercent && game.discountPercent > 0 && finalPrice < regularPrice);
        const wishlisted = isWishlisted(game.id);
        const gameSlug = game.slug ? slugify(game.slug) : slugify(game.title || game.name);

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
                    <Link
                        to={`/games/${gameSlug}`}
                        className="absolute inset-0 z-[1]"
                        aria-label={`Open ${game.title}`}
                        onClick={() => handleRecordViewed(game)}
                    />
                    {renderImage(game)}
                    {showBadge && (
                        <span className="absolute left-3 top-3 rounded-full bg-[#6b3ff2] px-3 py-1 text-xs font-semibold text-white shadow-sm">
                            New
                        </span>
                    )}
                    <button
                        type="button"
                        className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[#6f64a8] shadow-sm transition pointer-events-auto ${
                            wishlisted ? 'border-[#1f2937] text-[#1f2937]' : 'hover:text-[#6b3ff2]'
                        }`}
                        aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                        aria-pressed={wishlisted}
                        onClick={() => toggleWishlist(game.id)}
                        disabled={!game.id}
                        aria-disabled={!game.id}
                    >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill={wishlisted ? 'currentColor' : 'none'}>
                            <path
                                d="M12 20.2c-4.4-2.8-7.4-5.5-8.7-8.4-1.4-3.1.5-6.5 3.9-6.8 2.1-.2 3.6.8 4.8 2.2 1.2-1.4 2.7-2.4 4.8-2.2 3.4.3 5.3 3.7 3.9 6.8-1.3 2.9-4.3 5.6-8.7 8.4Z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>
                <div className="flex flex-1 flex-col">
                    <h3 className={`${isLarge ? 'text-lg' : 'text-sm'} font-semibold text-[#2c2354]`}>
                        <Link to={`/games/${gameSlug}`} onClick={() => handleRecordViewed(game)}>
                            {game.title}
                        </Link>
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                        {hasActiveDiscount ? (
                            <>
                                <span className="font-medium text-[#9b92c4] line-through">${regularPrice.toFixed(2)}</span>
                                <span className="font-semibold text-[#6b3ff2]">${finalPrice.toFixed(2)}</span>
                                <span className="rounded-full bg-[#e7dcff] px-2 py-0.5 text-xs font-semibold text-[#5a2dd1]">
                                    -{Number(game.discountPercent).toFixed(0)}%
                                </span>
                            </>
                        ) : (
                            <span className="font-medium text-[#6f64a8]">${finalPrice.toFixed(2)}</span>
                        )}
                    </div>
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

    const filteredGames = useMemo(() => {
        const byCategory = categoriesForDisplay.flatMap((category) => {
            const categoryGames = filteredGamesByCategory.get(category) ?? [];
            return categoryGames.map((game) => ({ category, game }));
        });

        const withPlatform = byCategory.filter(({ game }) => {
            if (selectedPlatforms.length === 0) {
                return true;
            }

            const gamePlatforms = extractPlatformsFromGame(game);

            return selectedPlatforms.some((platform) => gamePlatforms.includes(platform));
        });

        const withinPriceRange = withPlatform.filter(({ game }) => {
            const price = Number(game.finalPrice ?? game.price);
            return price >= minPriceFilter && price <= maxPriceFilter;
        });

        const sorted = [...withinPriceRange].sort((a, b) => {
            const leftPrice = Number(a.game.finalPrice ?? a.game.price);
            const rightPrice = Number(b.game.finalPrice ?? b.game.price);

            if (sortBy === 'price-asc') {
                return leftPrice - rightPrice;
            }
            if (sortBy === 'price-desc') {
                return rightPrice - leftPrice;
            }
            if (sortBy === 'name-asc') {
                return a.game.title.localeCompare(b.game.title);
            }
            if (sortBy === 'name-desc') {
                return b.game.title.localeCompare(a.game.title);
            }
            return 0;
        });

        return sorted;
    }, [
        categoriesForDisplay,
        filteredGamesByCategory,
        maxPriceFilter,
        minPriceFilter,
        selectedPlatforms,
        sortBy,
        extractPlatformsFromGame
    ]);

    const pageSize = 12;
    const totalPages = Math.max(1, Math.ceil(filteredGames.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const paginatedGames = filteredGames.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
    const totalResults = filteredGames.length;
    const showingFrom = totalResults === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
    const showingTo = Math.min(safeCurrentPage * pageSize, totalResults);
    const hasActiveFilters =
        Boolean(filterCategory) ||
        Boolean(filterName) ||
        selectedPlatforms.length > 0 ||
        minPriceFilter !== availablePrices.min ||
        maxPriceFilter !== availablePrices.max;

    const updateParams = (patchFn: (params: URLSearchParams) => void) => {
        patchSearchParams((params) => {
            patchFn(params);
            const nextPage = Number(params.get('page') ?? 1);
            if (nextPage < 1) {
                params.set('page', '1');
            }
        });
    };

    return (
        <div className="min-h-screen bg-[#f6f2fb] text-[#2b2350]">
            <div className="pointer-events-none fixed left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(204,190,255,0.55)_0%,rgba(246,242,251,0.1)_70%)] blur-3xl" />
            <main className="container container-wide relative z-10 px-4 pb-24 pt-12">
                <div className="mx-auto max-w-3xl text-center">
                    <h1 className="text-4xl font-semibold text-[#2b2350] sm:text-5xl">Game Catalog</h1>
                    <p className="mt-4 text-base text-[#6c6393]">
                        Discover and explore games across all genres. Use filters to quickly find what you're
                        looking for.
                    </p>
                </div>

                <div className="mt-10">
                    <label className="flex w-full items-center gap-2 rounded-[14px] border border-[#e6e1ff] bg-white px-4 py-3 text-sm text-[#6b64a8] shadow-sm">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#9b92c4]">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
                            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <input
                            type="text"
                            className="w-full bg-transparent text-sm text-[#5a5286] placeholder:text-[#b0a7d4] focus:outline-none"
                            placeholder="Search games..."
                            value={searchNameDraft}
                            onChange={handleSearchChange}
                        />
                    </label>
                </div>

                <section className="catalog-layout mt-8">
                    <aside className="catalog-sidebar">
                        <h2 className="text-2xl font-semibold text-[#2b2350]">Filters</h2>

                        <div className="mt-6 border-t border-[#f0ebff] pt-5">
                            <h3 className="text-lg font-semibold text-[#2b2350]">Categories</h3>
                            <div className="mt-3 space-y-2">
                                {categoryOptions.map((category) => {
                                    const checked = filterCategory === category;
                                    return (
                                        <label key={category} className="flex cursor-pointer items-center gap-3 text-sm text-[#5a5286]">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-[#d8d0ff] text-[#6b3ff2] focus:ring-[#6b3ff2]"
                                                checked={checked}
                                                onChange={() => setCategoryFilter(checked ? '' : category)}
                                            />
                                            <span>{category}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-6 border-t border-[#f0ebff] pt-5">
                            <h3 className="text-lg font-semibold text-[#2b2350]">Platforms</h3>
                            <div className="mt-3 space-y-2">
                                {availablePlatforms.map((platform) => {
                                    const checked = selectedPlatforms.includes(platform);
                                    return (
                                        <label key={platform} className="flex cursor-pointer items-center gap-3 text-sm text-[#5a5286]">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-[#d8d0ff] text-[#6b3ff2] focus:ring-[#6b3ff2]"
                                                checked={checked}
                                                onChange={() =>
                                                    updateParams((params) => {
                                                        const next = checked
                                                            ? selectedPlatforms.filter((item) => item !== platform)
                                                            : [...selectedPlatforms, platform];
                                                        if (next.length > 0) {
                                                            params.set('platforms', next.join(','));
                                                        } else {
                                                            params.delete('platforms');
                                                        }
                                                        params.set('page', '1');
                                                    })
                                                }
                                            />
                                            <span>{platform}</span>
                                        </label>
                                    );
                                })}
                                {availablePlatforms.length === 0 && (
                                    <p className="text-sm text-[#8a81b5]">No platform data available.</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 border-t border-[#f0ebff] pt-5">
                            <h3 className="text-lg font-semibold text-[#2b2350]">Price</h3>
                            <input
                                type="range"
                                min={availablePrices.min}
                                max={availablePrices.max}
                                value={maxPriceFilter}
                                className="mt-4 w-full accent-[#6b3ff2]"
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    updateParams((params) => {
                                        params.set('filterMaxPrice', String(value));
                                        params.set('filterMinPrice', String(Math.min(minPriceFilter, value)));
                                        params.set('page', '1');
                                    });
                                }}
                            />
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <input
                                    type="number"
                                    min={availablePrices.min}
                                    max={availablePrices.max}
                                    value={minPriceFilter}
                                    className="h-10 rounded-[12px] border border-[#e6e1ff] px-3 text-sm text-[#5a5286] focus:outline-none"
                                    onChange={(event) => {
                                        const value = Number(event.target.value);
                                        updateParams((params) => {
                                            if (Number.isFinite(value)) {
                                                params.set('filterMinPrice', String(value));
                                                params.set('page', '1');
                                            }
                                        });
                                    }}
                                />
                                <input
                                    type="number"
                                    min={availablePrices.min}
                                    max={availablePrices.max}
                                    value={maxPriceFilter}
                                    className="h-10 rounded-[12px] border border-[#e6e1ff] px-3 text-sm text-[#5a5286] focus:outline-none"
                                    onChange={(event) => {
                                        const value = Number(event.target.value);
                                        updateParams((params) => {
                                            if (Number.isFinite(value)) {
                                                params.set('filterMaxPrice', String(value));
                                                params.set('page', '1');
                                            }
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button
                                className="rounded-[12px] border border-[#6b3ff2] bg-transparent px-4 py-2 text-sm font-semibold text-[#6b3ff2]"
                                onClick={clearAllFilters}
                            >
                                Reset
                            </button>
                            <button
                                className="rounded-[12px] bg-[#6b3ff2] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(107,63,242,0.28)]"
                                onClick={() => updateParams((params) => params.set('page', '1'))}
                            >
                                Apply Filters
                            </button>
                        </div>
                    </aside>

                    <div className="catalog-products">
                        <div className="catalog-toolbar">
                            <div className="catalog-toolbar-summary">
                                <p className="catalog-results-label">Showing {showingFrom}-{showingTo} of {totalResults} games</p>
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        className="catalog-clear-filters"
                                        onClick={clearAllFilters}
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                            <div className="relative catalog-sort-wrap">
                                <select
                                    className="h-11 w-full rounded-[12px] border border-[#e6e1ff] bg-white px-4 pr-9 text-sm font-medium text-[#5a5286] shadow-sm focus:outline-none"
                                    value={sortBy}
                                    onChange={(event) =>
                                        updateParams((params) => {
                                            params.set('sortBy', event.target.value);
                                            params.set('page', '1');
                                        })
                                    }
                                >
                                    <option value="popular">Sort by: Most Popular</option>
                                    <option value="price-asc">Sort by: Price Low to High</option>
                                    <option value="price-desc">Sort by: Price High to Low</option>
                                    <option value="name-asc">Sort by: Name A-Z</option>
                                    <option value="name-desc">Sort by: Name Z-A</option>
                                </select>
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9b92c4]">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                </span>
                            </div>
                        </div>

                        <div className="catalog-grid">
                            {paginatedGames.map(({ category, game }, index) => {
                                const gameSlug = game.slug ? slugify(game.slug) : slugify(game.title || game.name);
                                const finalPrice = Number(game.finalPrice ?? game.price);
                                const wishlisted = isWishlisted(game.id);

                                return (
                                    <article
                                        key={`${game.id ?? index}-${category}`}
                                        className="catalog-game-card group"
                                    >
                                        <div className="catalog-game-image">
                                            <Link
                                                to={`/games/${gameSlug}`}
                                                className="absolute inset-0 z-[1]"
                                                aria-label={`Open ${game.title}`}
                                                onClick={() => handleRecordViewed(game)}
                                            />
                                            {renderImage(game)}
                                            <button
                                                type="button"
                                                className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[#6f64a8] shadow-sm transition pointer-events-auto ${
                                                    wishlisted ? 'border-[#1f2937] text-[#1f2937]' : 'hover:text-[#6b3ff2]'
                                                }`}
                                                aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                                                aria-pressed={wishlisted}
                                                onClick={() => toggleWishlist(game.id)}
                                                disabled={!game.id}
                                            >
                                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill={wishlisted ? 'currentColor' : 'none'}>
                                                    <path
                                                        d="M12 20.2c-4.4-2.8-7.4-5.5-8.7-8.4-1.4-3.1.5-6.5 3.9-6.8 2.1-.2 3.6.8 4.8 2.2 1.2-1.4 2.7-2.4 4.8-2.2 3.4.3 5.3 3.7 3.9 6.8-1.3 2.9-4.3 5.6-8.7 8.4Z"
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                        strokeLinejoin="round"
                                                    />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="catalog-game-body">
                                            <h3 className="catalog-game-title">
                                                <Link to={`/games/${gameSlug}`} onClick={() => handleRecordViewed(game)}>
                                                    {game.title}
                                                </Link>
                                            </h3>
                                            <span className="catalog-game-chip">
                                                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                                                    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                                                    <circle cx="10" cy="10" r="1.8" fill="currentColor" />
                                                </svg>
                                                {category}
                                            </span>
                                            <div className="catalog-game-footer">
                                                <span className="catalog-game-price">${finalPrice.toFixed(2)}</span>
                                                <button
                                                    className="catalog-game-cta"
                                                    onClick={() => handleAddToCart(game)}
                                                >
                                                    Add to Cart
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                            {paginatedGames.length === 0 && (
                                <div className="col-span-full rounded-[16px] border border-dashed border-[#e6e1ff] bg-white/70 py-12 text-center text-sm text-[#8a81b5]">
                                    No games found for current filters.
                                </div>
                            )}
                        </div>

                        <div className="mt-8 flex items-center justify-center gap-2">
                            <button
                                className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#e6e1ff] bg-white text-[#6b64a8] disabled:opacity-50"
                                onClick={() =>
                                    updateParams((params) => {
                                        params.set('page', String(Math.max(1, safeCurrentPage - 1)));
                                    })
                                }
                                disabled={safeCurrentPage <= 1}
                            >
                                ‹
                            </button>
                            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                                <button
                                    key={page}
                                    className={`flex h-10 min-w-10 items-center justify-center rounded-[12px] px-3 text-sm font-semibold ${
                                        page === safeCurrentPage
                                            ? 'bg-[#6b3ff2] text-white'
                                            : 'border border-[#e6e1ff] bg-white text-[#6b64a8]'
                                    }`}
                                    onClick={() => updateParams((params) => params.set('page', String(page)))}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#e6e1ff] bg-white text-[#6b64a8] disabled:opacity-50"
                                onClick={() =>
                                    updateParams((params) => {
                                        params.set('page', String(Math.min(totalPages, safeCurrentPage + 1)));
                                    })
                                }
                                disabled={safeCurrentPage >= totalPages}
                            >
                                ›
                            </button>
                        </div>
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
