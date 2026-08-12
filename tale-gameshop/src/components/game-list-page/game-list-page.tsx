import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import IDENTIFIERS from '../../constants/identifiers';
import './game-list-page.css';
import container from '../../inversify.config';
import { Game } from '../../models/game';
import { useWishlist } from '../../context/wishlist-context';
import type { IUrlService } from '../../iterfaces/i-url-service';
import type { IKeycloakService } from '../../iterfaces/i-keycloak-service';
import type { IRecommendationsService } from '../../iterfaces/i-recommendations-service';

import { analyticsClient } from '../../utils/analytics-client';
import { slugify } from '../../utils/slugify';
import { formatReleaseDate } from '../../utils/format-release-date';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faDesktop, faGamepad } from '@fortawesome/free-solid-svg-icons';
import { faApple, faLinux, faPlaystation, faXbox } from '@fortawesome/free-brands-svg-icons';
import SafeGameImage from '../common/SafeGameImage';
import GameCoverOverlay from '../common/GameCoverOverlay';
import PageMeta from '../common/PageMeta';
import Breadcrumbs, { type Crumb } from '../common/Breadcrumbs';
import PriceRangeFilter from './PriceRangeFilter';
import SortSelect, { type SortOption } from './SortSelect';
import {
    EMPTY_CATALOG_PAGE,
    getCatalogPage,
    type CatalogPage,
    type FacetCount
} from '../../api/catalogApi';
import { EMPTY_SITE_REVIEW_SUMMARY, getSiteReviewSummary, type SiteReviewSummary } from '../../api/reviewsApi';

/**
 * Сколько карточек на странице. Карточка компактная (цена лежит на обложке), поэтому
 * помещается вдвое больше товара, чем раньше: выбирают сравнением, а не листанием.
 */
const PAGE_SIZE = 24;

/** Насколько ждём паузу в наборе, прежде чем записать поиск в адрес и в аналитику. */
const SEARCH_DEBOUNCE_MS = 350;

/** Как показывать выдачу: сеткой карточек или строками. Выбор живёт в адресе. */
type ViewMode = 'grid' | 'list';

/** Порядок по умолчанию: он же `sort` на сервере, если параметр не передан. */
const DEFAULT_SORT = 'popular';

/** Порядок выдачи. Значения совпадают с тем, что понимает сервер. */
const SORT_OPTIONS: SortOption[] = [
    { value: 'popular', label: 'Most popular' },
    { value: 'discount', label: 'Biggest discount' },
    { value: 'rating', label: 'Top rated' },
    { value: 'reviews', label: 'Most reviewed' },
    { value: 'new', label: 'Newest' },
    { value: 'price-asc', label: 'Price: low to high' },
    { value: 'price-desc', label: 'Price: high to low' },
    { value: 'name-asc', label: 'Name: A–Z' },
    { value: 'name-desc', label: 'Name: Z–A' }
];

/**
 * Всё, что сбрасывает «Reset filters». Один список на весь файл: добавили фильтр —
 * добавили сюда, иначе сброс тихо оставит его включённым.
 */
const FILTER_PARAM_NAMES = [
    'categories',
    'filterCategory',
    'filterName',
    'filterMinPrice',
    'filterMaxPrice',
    'sortBy',
    'page',
    'platforms',
    'comingSoon',
    'onSale',
    'inStock'
];

/**
 * Строка фильтра с числом результатов. Число — не украшение: оно избавляет от клика
 * вслепую, потому что заранее видно, есть ли там что-то.
 *
 * Вариант, который ничего не даст, не показывается вовсе — кроме случая, когда он уже
 * выбран: иначе его нельзя было бы снять, и выдача осталась бы пустой без объяснений.
 */
const FilterOption: React.FC<{
    label: string;
    checked: boolean;
    count: number;
    onToggle: () => void;
    /** Иконка перед названием — для платформ, где значок узнаётся быстрее слова. */
    icon?: IconDefinition;
}> = ({ label, checked, count, onToggle, icon }) => {
    if (count === 0 && !checked) {
        return null;
    }

    return (
        <label className={`catalog-filter-option${checked ? ' is-checked' : ''}`}>
            <input type="checkbox" checked={checked} onChange={onToggle} />
            <span className="catalog-filter-box" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                    <path d="m5 10.5 3.2 3.2L15 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </span>
            {icon && <FontAwesomeIcon icon={icon} className="catalog-filter-icon" />}
            <span className="catalog-filter-label">{label}</span>
            <span className="catalog-filter-count">{count}</span>
        </label>
    );
};

/** Значки платформ в фильтре — те же, что на карточках товара. */
const platformGlyphs: Record<string, IconDefinition> = {
    PC: faDesktop,
    Mac: faApple,
    Linux: faLinux,
    PlayStation: faPlaystation,
    Xbox: faXbox,
    Nintendo: faGamepad
};

/**
 * Пять звёзд, из которых закрашены только заслуженные: доля округляется до целой звезды,
 * а точное значение стоит рядом цифрой. Пустые звёзды остаются видимыми контуром —
 * иначе «три звезды» и «три из трёх» выглядели бы одинаково.
 */
const StarRow: React.FC<{ rating: number; className: string }> = ({ rating, className }) => {
    const filled = Math.round(rating);

    return (
        <div className="flex items-center gap-0.5 text-[#6b3ff2]" aria-label={`${rating.toFixed(1)} out of 5`}>
            {Array.from({ length: 5 }).map((_, index) => (
                <svg
                    key={`star-${index}`}
                    viewBox="0 0 20 20"
                    className={className}
                    fill={index < filled ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth={index < filled ? 0 : 1.5}
                    aria-hidden="true"
                >
                    <path d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z" />
                </svg>
            ))}
        </div>
    );
};

const TaleGameshopGameList: React.FC = () => {
    // Страница каталога целиком приходит с сервера: и товар, и счётчики фильтров.
    const [catalog, setCatalog] = useState<CatalogPage>(EMPTY_CATALOG_PAGE);
    const [isLoading, setIsLoading] = useState(true);
    const [reviewSummary, setReviewSummary] = useState<SiteReviewSummary>(EMPTY_SITE_REVIEW_SUMMARY);
    const [searchParams, setSearchParams] = useSearchParams();
    // Непусто — открыта посадочная страница жанра (/games/category/action).
    const { categorySlug } = useParams<{ categorySlug: string }>();
    const navigate = useNavigate();
    const { isWishlisted, toggle: toggleWishlist } = useWishlist();

    const services = useMemo(
        () => ({
            urlService: container.get<IUrlService>(IDENTIFIERS.IUrlService),
            keycloakService: container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService),
            recommendationsService: container.get<IRecommendationsService>(IDENTIFIERS.IRecommendationsService)
        }),
        []
    );

    // Из внешних ссылок категория приходит подстрокой (?filterCategory=RPG попадает
    // в «Role-Playing Games (RPGs)»), сайдбар же выбирает точные названия списком.
    const categoryQuery = searchParams.get('filterCategory') ?? '';
    const filterName = searchParams.get('filterName') ?? '';
    const viewMode: ViewMode = searchParams.get('view') === 'list' ? 'list' : 'grid';

    const [searchNameDraft, setSearchNameDraft] = useState(filterName);
    const searchTimeoutRef = useRef<number | null>(null);

    // Поле могло получить значение извне — из шапки сайта или по ссылке.
    useEffect(() => {
        setSearchNameDraft(filterName);
    }, [filterName]);

    useEffect(
        () => () => {
            if (searchTimeoutRef.current) {
                window.clearTimeout(searchTimeoutRef.current);
            }
        },
        []
    );

    /**
     * Запрос к каталогу собирается прямо из адресной строки: имена параметров совпадают
     * с теми, что понимает сервер, поэтому ссылку на отфильтрованную выдачу можно скопировать
     * и она откроется такой же.
     */
    const catalogRequest = useMemo(() => {
        const request = new URLSearchParams();
        const copy = (from: string, to: string) => {
            const value = searchParams.get(from);
            if (value) {
                request.set(to, value);
            }
        };

        copy('filterName', 'q');
        copy('categories', 'categories');
        copy('filterCategory', 'categoryQuery');
        if (categorySlug) {
            request.set('categorySlug', categorySlug);
        }
        copy('platforms', 'platforms');
        copy('filterMinPrice', 'minPrice');
        copy('filterMaxPrice', 'maxPrice');
        copy('onSale', 'onSale');
        copy('inStock', 'inStock');
        copy('comingSoon', 'comingSoon');
        request.set('sort', searchParams.get('sortBy') ?? 'popular');
        request.set('page', String(Math.max(1, Number(searchParams.get('page') ?? 1))));
        request.set('pageSize', String(PAGE_SIZE));

        return request;
    }, [searchParams, categorySlug]);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);

        (async () => {
            try {
                const page = await getCatalogPage(catalogRequest);
                // Ответ на устаревший запрос игнорируем: фильтры могли смениться,
                // пока он шёл, и выдача мигнула бы чужим результатом.
                if (!cancelled) {
                    setCatalog(page);
                }
            } catch {
                if (!cancelled) {
                    setCatalog(EMPTY_CATALOG_PAGE);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [catalogRequest]);

    useEffect(() => {
        (async () => {
            try {
                setReviewSummary(await getSiteReviewSummary());
            } catch {
                // Сводка недоступна — блок отзывов покажет пустое состояние.
            }
        })();
    }, []);

    const patchSearchParams = useCallback(
        (patchFn: (params: URLSearchParams) => void, options?: { replace?: boolean }) => {
            setSearchParams((previous) => {
                const params = new URLSearchParams(previous);
                patchFn(params);
                return params;
            }, options);
        },
        [setSearchParams]
    );

    /**
     * Ссылка на свежую версию правки адреса. Роутер разрешает функциональное обновление,
     * но подставляет в него параметры на момент создания колбэка, а не на момент вызова.
     * Отложенная запись из таймера без этой ссылки вернула бы фильтры к состоянию,
     * которое было в начале паузы.
     */
    const patchSearchParamsRef = useRef(patchSearchParams);
    useEffect(() => {
        patchSearchParamsRef.current = patchSearchParams;
    }, [patchSearchParams]);

    /**
     * Поле поиска ведёт себя как черновик: буквы копятся в состоянии, а в адрес уходят
     * после паузы и через replace. Иначе на каждую букву появлялась бы запись в истории
     * браузера — «назад» после набора названия пришлось бы жать десяток раз.
     */
    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearchNameDraft(value);

        if (searchTimeoutRef.current) {
            window.clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = window.setTimeout(() => {
            patchSearchParamsRef.current(
                (params) => {
                    if (value) {
                        params.set('filterName', value);
                    } else {
                        params.delete('filterName');
                    }
                    params.set('page', '1');
                },
                { replace: true }
            );

            if (value.trim().length >= 2) {
                analyticsClient.trackEvent('search', { search_term: value.trim() });
            }
        }, SEARCH_DEBOUNCE_MS);
    };

    /**
     * Сброс фильтров, при желании — сразу с новой сортировкой. Всё одной правкой адреса:
     * два подряд вызова роутер схлопнул бы в последний, и сброс потерялся бы.
     */
    const clearAllFilters = (nextSortBy?: string) => {
        setSearchNameDraft('');
        patchSearchParams((params) => {
            FILTER_PARAM_NAMES.forEach((name) => params.delete(name));
            if (nextSortBy) {
                params.set('sortBy', nextSortBy);
            }
        });
    };

    const categoryOptions = useMemo(
        () => catalog.facets.categories.map((facet) => facet.value),
        [catalog.facets.categories]
    );

    const explicitCategories = useMemo(() => {
        return (searchParams.get('categories') ?? '')
            .split(',')
            .map((category) => category.trim())
            .filter(Boolean);
    }, [searchParams]);

    /**
     * Категории, отмеченные сейчас: либо точный набор из сайдбара, либо то, во что
     * развернулась подстрока из внешней ссылки. Пустой массив при непустой подстроке —
     * законный случай: ссылка ведёт на категорию, которой у нас нет, и выдача пустая.
     */
    const activeCategories = useMemo(() => {
        // На посадочной странице жанр задан адресом — он и есть выбранная категория.
        if (categorySlug) {
            const known = categoryOptions.find((category) => slugify(category) === categorySlug);
            return known ? [known] : [];
        }

        if (explicitCategories.length > 0) {
            return explicitCategories;
        }

        if (!categoryQuery) {
            return [];
        }

        const normalized = categoryQuery.toLowerCase();
        return categoryOptions.filter((category) => category.toLowerCase().includes(normalized));
    }, [categorySlug, explicitCategories, categoryQuery, categoryOptions]);

    const hasCategoryFilter = Boolean(categorySlug) || explicitCategories.length > 0 || Boolean(categoryQuery);

    /**
     * Переключение категории в сайдбаре. Подстрочный фильтр из ссылки при первом же клике
     * разворачивается в точный набор и удаляется — дальше состояние однозначное.
     *
     * С посадочной страницы жанра уводим в общий каталог: там категория задана адресом,
     * и оставить её вместе с выбором в сайдбаре значило бы показывать два разных фильтра
     * как один.
     */
    const toggleCategory = (category: string) => {
        const next = activeCategories.includes(category)
            ? activeCategories.filter((item) => item !== category)
            : [...activeCategories, category];

        if (categorySlug) {
            navigate(next.length > 0 ? `/games?categories=${encodeURIComponent(next.join(','))}` : '/games');
            return;
        }

        patchSearchParams((params) => {
            params.delete('filterCategory');
            if (next.length > 0) {
                params.set('categories', next.join(','));
            } else {
                params.delete('categories');
            }
            params.set('page', '1');
        });
    };

    const availablePrices = catalog.priceRange;

    const selectedPlatforms = useMemo(() => {
        return (searchParams.get('platforms') ?? '')
            .split(',')
            .map((platform) => platform.trim())
            .filter(Boolean);
    }, [searchParams]);

    const comingSoonOnly = searchParams.get('comingSoon') === '1';
    const onSaleOnly = searchParams.get('onSale') === '1';
    const inStockOnly = searchParams.get('inStock') === '1';
    const minPriceFilter = Number(searchParams.get('filterMinPrice') ?? availablePrices.min);
    const maxPriceFilter = Number(searchParams.get('filterMaxPrice') ?? availablePrices.max);
    const sortBy = searchParams.get('sortBy') ?? DEFAULT_SORT;
    const currentPage = Math.max(1, Number(searchParams.get('page') ?? 1));

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


    const paginatedGames = catalog.items;
    const totalResults = catalog.total;
    const totalPages = Math.max(1, Math.ceil(totalResults / catalog.pageSize));
    const safeCurrentPage = catalog.page;
    const showingFrom = totalResults === 0 ? 0 : (safeCurrentPage - 1) * catalog.pageSize + 1;
    const showingTo = Math.min(safeCurrentPage * catalog.pageSize, totalResults);
    const priceNarrowed = minPriceFilter !== availablePrices.min || maxPriceFilter !== availablePrices.max;

    /**
     * Есть ли что сбрасывать. Порядок выдачи входит сюда наравне с фильтрами: «Reset filters»
     * возвращает и его тоже, а без этого условия строка чипов пряталась целиком, стоило снять
     * последний фильтр, — вместе с чипом сортировки, хотя сама сортировка продолжала работать.
     */
    const hasActiveFilters =
        hasCategoryFilter ||
        Boolean(filterName) ||
        selectedPlatforms.length > 0 ||
        comingSoonOnly ||
        onSaleOnly ||
        inStockOnly ||
        priceNarrowed ||
        sortBy !== DEFAULT_SORT;

    /**
     * Блок «наличие и предложения» — первым в сайдбаре: это те вопросы, с которыми
     * покупатель приходит («что со скидкой», «что можно купить прямо сейчас»),
     * а не уточнения после выбора жанра.
     */
    const availabilityFilters = useMemo(
        () => [
            { param: 'inStock', label: 'In stock', active: inStockOnly, count: catalog.facets.availability.inStock },
            { param: 'onSale', label: 'On sale', active: onSaleOnly, count: catalog.facets.availability.onSale },
            {
                param: 'comingSoon',
                label: 'Coming soon',
                active: comingSoonOnly,
                count: catalog.facets.availability.comingSoon
            }
        ],
        [inStockOnly, onSaleOnly, comingSoonOnly, catalog.facets.availability]
    );

    /** Счётчик у варианта фильтра. Отсутствие варианта в ответе означает ноль результатов. */
    const facetCountOf = (facets: FacetCount[], value: string) =>
        facets.find((facet) => facet.value === value)?.count ?? 0;

    /**
     * Название жанра для посадочной страницы. Берём настоящее из ответа сервера, но пока он
     * не пришёл — восстанавливаем из адреса, чтобы заголовок не мигал пустотой.
     */
    const landingCategory = useMemo(() => {
        if (!categorySlug) {
            return null;
        }

        const known = categoryOptions.find((category) => slugify(category) === categorySlug);
        return known ?? categorySlug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    }, [categorySlug, categoryOptions]);

    const breadcrumbs = useMemo<Crumb[]>(() => {
        const trail: Crumb[] = [{ label: 'Home', to: '/' }];

        if (landingCategory) {
            trail.push({ label: 'Game keys', to: '/games' }, { label: landingCategory });
        } else {
            trail.push({ label: 'Game keys' });
        }

        return trail;
    }, [landingCategory]);

    /**
     * Заголовок, описание и служебные теги страницы.
     *
     * Отфильтрованные и постраничные виды прячем из поиска: это тот же товар в другом
     * порядке, и в индексе такие страницы конкурируют сами с собой. Канонический адрес
     * при этом указывает на чистую страницу — вес ссылок достаётся ей.
     */
    const pageMeta = useMemo(() => {
        const basePath = landingCategory ? `/games/category/${categorySlug}` : '/games';
        const isPlainListing = !hasActiveFilters && safeCurrentPage === 1;

        const title = landingCategory
            ? `${landingCategory} games`
            : 'All PC game keys';
        const description = landingCategory
            ? `Buy ${landingCategory.toLowerCase()} PC game keys at Tale Shop — hand-picked titles, secure checkout and instant delivery.`
            : 'Browse every PC game key at Tale Shop — hand-picked titles, secure checkout and instant delivery.';

        // Список товаров страницы для поисковой разметки: так в выдаче может появиться
        // карусель товаров, а не просто синяя ссылка.
        const itemList = paginatedGames.length > 0
            ? {
                  '@context': 'https://schema.org',
                  '@type': 'ItemList',
                  name: title,
                  numberOfItems: totalResults,
                  itemListElement: paginatedGames.map((game, index) => ({
                      '@type': 'ListItem',
                      position: (safeCurrentPage - 1) * catalog.pageSize + index + 1,
                      url: `${window.location.origin}/games/${
                          game.slug ? slugify(game.slug) : slugify(game.title || game.name)
                      }`,
                      name: game.title
                  }))
              }
            : null;

        return {
            title,
            description,
            canonicalPath: basePath,
            noIndex: !isPlainListing,
            structuredData: itemList
        };
    }, [landingCategory, categorySlug, hasActiveFilters, safeCurrentPage, paginatedGames, totalResults, catalog.pageSize]);

    const updateParams = (patchFn: (params: URLSearchParams) => void) => {
        patchSearchParams((params) => {
            patchFn(params);
            const nextPage = Number(params.get('page') ?? 1);
            if (nextPage < 1) {
                params.set('page', '1');
            }
        });
    };

    /** Снятие одной платформы — нужно и в сайдбаре, и в чипах активных фильтров. */
    const togglePlatform = (platform: string) => {
        const next = selectedPlatforms.includes(platform)
            ? selectedPlatforms.filter((item) => item !== platform)
            : [...selectedPlatforms, platform];

        updateParams((params) => {
            if (next.length > 0) {
                params.set('platforms', next.join(','));
            } else {
                params.delete('platforms');
            }
            params.set('page', '1');
        });
    };

    /** Включение-выключение фильтра-галочки (`?onSale=1` и подобных). */
    const toggleFlag = (name: string, enabled: boolean) => {
        updateParams((params) => {
            if (enabled) {
                params.delete(name);
            } else {
                params.set(name, '1');
            }
            params.set('page', '1');
        });
    };

    /**
     * Границы цены пишем парой: числовые поля позволяют завести минимум выше максимума,
     * и тогда выдача молча опустеет. Порядок восстанавливаем сразу при вводе.
     */
    const setPriceRange = (nextMin: number, nextMax: number) => {
        const low = Math.min(nextMin, nextMax);
        const high = Math.max(nextMin, nextMax);
        // Диапазон во всю ширину — это отсутствие фильтра: убираем параметры из адреса,
        // иначе в чипах висел бы «фильтр», который ничего не отсекает.
        const isFullRange = low <= availablePrices.min && high >= availablePrices.max;

        updateParams((params) => {
            if (isFullRange) {
                params.delete('filterMinPrice');
                params.delete('filterMaxPrice');
            } else {
                params.set('filterMinPrice', String(low));
                params.set('filterMaxPrice', String(high));
            }
            params.set('page', '1');
        });
    };

    /**
     * Что сейчас включено — списком с крестиком у каждого. Без этого единственным способом
     * отменить один фильтр был сброс всех, а понять, почему выдача пуста, приходилось
     * пролистыванием сайдбара.
     */
    const activeFilterChips = useMemo(() => {
        const chips: { key: string; label: string; remove: () => void }[] = [];

        // Порядок выдачи тоже попадает в чипы — но только когда он отличается от обычного.
        // Иначе строка висела бы всегда и предлагала «сбросить» то, что и так по умолчанию.
        if (sortBy !== DEFAULT_SORT) {
            chips.push({
                key: 'sort',
                label: SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? sortBy,
                remove: () =>
                    updateParams((params) => {
                        params.delete('sortBy');
                        params.set('page', '1');
                    })
            });
        }

        if (filterName) {
            chips.push({
                key: 'name',
                label: `“${filterName}”`,
                remove: () =>
                    updateParams((params) => {
                        params.delete('filterName');
                        params.set('page', '1');
                    })
            });
        }

        activeCategories.forEach((category) =>
            chips.push({ key: `category:${category}`, label: category, remove: () => toggleCategory(category) })
        );

        selectedPlatforms.forEach((platform) =>
            chips.push({ key: `platform:${platform}`, label: platform, remove: () => togglePlatform(platform) })
        );

        availabilityFilters
            .filter((filter) => filter.active)
            .forEach((filter) =>
                chips.push({
                    key: filter.param,
                    label: filter.label,
                    remove: () => toggleFlag(filter.param, true)
                })
            );

        if (priceNarrowed) {
            chips.push({
                key: 'price',
                label: `$${minPriceFilter} – $${maxPriceFilter}`,
                remove: () =>
                    updateParams((params) => {
                        params.delete('filterMinPrice');
                        params.delete('filterMaxPrice');
                        params.set('page', '1');
                    })
            });
        }

        return chips;
        // Обработчики создаются заново на каждый рендер — это дешевле, чем мемоизировать
        // их поимённо, а список чипов короткий.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortBy, filterName, activeCategories, selectedPlatforms, availabilityFilters, priceNarrowed, minPriceFilter, maxPriceFilter]);

    return (
        <div className="min-h-screen bg-[#f6f2fb] text-[#2b2350]">
            <div className="pointer-events-none fixed left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(204,190,255,0.55)_0%,rgba(246,242,251,0.1)_70%)] blur-3xl" />
            {/* Каталог шире остального сайта: это витрина, и на широком экране лишние
                поля по бокам отнимают у товара место, а не добавляют воздуха. */}
            <main className="container catalog-container relative z-10 pb-24 pt-8">
                <PageMeta
                    title={pageMeta.title}
                    description={pageMeta.description}
                    canonicalPath={pageMeta.canonicalPath}
                    noIndex={pageMeta.noIndex}
                    structuredData={pageMeta.structuredData}
                />

                {/* Шапка страницы намеренно в одну строку: заголовок, счётчик и путь.
                    Поиска здесь нет — он живёт в шапке сайта и ведёт сюда же, а второе
                    такое же поле только отодвигало товар вниз. */}
                <div className="catalog-head">
                    <Breadcrumbs items={breadcrumbs} />
                    <div className="catalog-head-line">
                        <h1>{landingCategory ? `${landingCategory} games` : 'Game catalog'}</h1>
                        <span className="catalog-head-count">
                            {totalResults} {totalResults === 1 ? 'game' : 'games'}
                        </span>
                    </div>
                    {filterName && (
                        <p className="catalog-head-note">
                            Results for <strong>{filterName}</strong>
                        </p>
                    )}
                </div>

                <section className="catalog-layout">
                    <aside className="catalog-sidebar">
                        <div className="catalog-sidebar-head">
                            <h2>Filters</h2>
                            {hasActiveFilters && (
                                <span className="catalog-sidebar-count">{activeFilterChips.length}</span>
                            )}
                        </div>

                        <div className="catalog-filter-group">
                            <h3 className="catalog-filter-title">Availability</h3>
                            <div className="catalog-filter-options">
                                {availabilityFilters.map((filter) => (
                                    <FilterOption
                                        key={filter.param}
                                        label={filter.label}
                                        checked={filter.active}
                                        count={filter.count}
                                        onToggle={() => toggleFlag(filter.param, filter.active)}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="catalog-filter-group">
                            <h3 className="catalog-filter-title">Price</h3>
                            <PriceRangeFilter
                                min={availablePrices.min}
                                max={availablePrices.max}
                                from={minPriceFilter}
                                to={maxPriceFilter}
                                histogram={catalog.facets.priceHistogram}
                                onChange={setPriceRange}
                            />

                            {/* Готовые диапазоны: большинство приходит с суммой в голове,
                                а не с желанием точно позиционировать ручку. */}
                            {catalog.facets.pricePresets.length > 0 && (
                                <div className="price-presets">
                                    {catalog.facets.pricePresets.map((preset) => {
                                        const upper = preset.to ?? availablePrices.max;
                                        const active =
                                            priceNarrowed &&
                                            minPriceFilter === preset.from &&
                                            maxPriceFilter === upper;

                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                className={active ? 'is-active' : ''}
                                                aria-pressed={active}
                                                // Повторный клик по выбранному снимает фильтр —
                                                // иначе вернуть полный диапазон можно было бы
                                                // только ползунком.
                                                onClick={() =>
                                                    active
                                                        ? setPriceRange(availablePrices.min, availablePrices.max)
                                                        : setPriceRange(preset.from, upper)
                                                }
                                            >
                                                <span>{preset.label}</span>
                                                <span className="price-preset-count">{preset.count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="catalog-filter-group">
                            <h3 className="catalog-filter-title">Platforms</h3>
                            <div className="catalog-filter-options">
                                {catalog.facets.platforms.map((facet) => (
                                    <FilterOption
                                        key={facet.value}
                                        label={facet.value}
                                        icon={platformGlyphs[facet.value]}
                                        checked={selectedPlatforms.includes(facet.value)}
                                        count={facet.count}
                                        onToggle={() => togglePlatform(facet.value)}
                                    />
                                ))}
                                {catalog.facets.platforms.length === 0 && (
                                    <p className="text-sm text-[#8a81b5]">No platform data available.</p>
                                )}
                            </div>
                        </div>

                        <div className="catalog-filter-group">
                            <h3 className="catalog-filter-title">Categories</h3>
                            <div className="catalog-filter-options">
                                {categoryOptions.map((category) => (
                                    <FilterOption
                                        key={category}
                                        label={category}
                                        checked={activeCategories.includes(category)}
                                        count={facetCountOf(catalog.facets.categories, category)}
                                        onToggle={() => toggleCategory(category)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Кнопки «применить» нет намеренно: фильтры срабатывают сразу,
                            и она лишь создавала бы впечатление незавершённого действия. */}
                        <button
                            className="catalog-filter-reset"
                            onClick={() => clearAllFilters()}
                            disabled={!hasActiveFilters}
                        >
                            Reset filters
                        </button>
                    </aside>

                    <div className="catalog-products">
                        {/* Панель управления выдачей в три уровня: сначала действия
                            (поиск, порядок, вид), затем то, что сейчас применено, и только
                            потом счётчик. Строка с чипами появляется лишь когда есть чипы. */}
                        <div className="catalog-toolbar">
                            <div className="catalog-toolbar-row">
                                <label className="catalog-search">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
                                        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Search by game name"
                                        aria-label="Search games in the catalog"
                                        value={searchNameDraft}
                                        onChange={handleSearchChange}
                                    />
                                </label>

                                <SortSelect
                                    options={SORT_OPTIONS}
                                    value={sortBy}
                                    onChange={(next) =>
                                        updateParams((params) => {
                                            params.set('sortBy', next);
                                            params.set('page', '1');
                                        })
                                    }
                                />

                                {/* Вид — не фильтр, поэтому «Reset filters» его не трогает. */}
                                <div className="catalog-view" role="group" aria-label="View mode">
                                    <button
                                        type="button"
                                        className={viewMode === 'grid' ? 'is-active' : ''}
                                        aria-pressed={viewMode === 'grid'}
                                        title="Grid"
                                        onClick={() => updateParams((params) => params.delete('view'))}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                                            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                                            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                                            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                                        </svg>
                                        <span className="sr-only-label">Grid</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={viewMode === 'list' ? 'is-active' : ''}
                                        aria-pressed={viewMode === 'list'}
                                        title="List"
                                        onClick={() => updateParams((params) => params.set('view', 'list'))}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                        </svg>
                                        <span className="sr-only-label">List</span>
                                    </button>
                                </div>
                            </div>

                            {/* Условие — сам список чипов, а не отдельный флаг: так строка
                                и её содержимое не могут разойтись. */}
                            {activeFilterChips.length > 0 && (
                                <div className="catalog-toolbar-row catalog-chosen">
                                    <span className="catalog-chosen-label">Chosen filters:</span>
                                    {/* Каждый включённый фильтр — со своим крестиком: снять один,
                                        не сбрасывая остальные. */}
                                    {activeFilterChips.map((chip) => (
                                        <button
                                            key={chip.key}
                                            type="button"
                                            className="catalog-filter-chip"
                                            onClick={chip.remove}
                                            aria-label={`Remove filter ${chip.label}`}
                                        >
                                            {chip.label}
                                            <span aria-hidden="true">×</span>
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className="catalog-clear-filters"
                                        onClick={() => clearAllFilters()}
                                    >
                                        Clear all
                                    </button>
                                </div>
                            )}

                            <p className="catalog-results-label">
                                Showing {showingFrom}–{showingTo} of {totalResults} games
                            </p>
                        </div>

                        {/* Пока грузится следующая страница, прежняя остаётся на месте и просто
                            приглушается: подмена сетки на пустоту читается как «ничего не нашлось». */}
                        {/* Ключ меняется вместе с выдачей: карточки пересоздаются, и анимация
                            появления проигрывается заново. Без этого новая страница просто
                            подменяла бы содержимое на месте, без всякого перехода. */}
                        <div
                            key={catalogRequest.toString()}
                            className={`catalog-grid${viewMode === 'list' ? ' is-list' : ''}${
                                isLoading ? ' is-loading' : ''
                            }`}
                        >
                            {paginatedGames.map((game, index) => {
                                const gameSlug = game.slug ? slugify(game.slug) : slugify(game.title || game.name);
                                const wishlisted = isWishlisted(game.id);
                                const soldOut = game.inStock === false;

                                return (
                                    <article
                                        key={game.id ?? `game-${index}`}
                                        className="catalog-game-card group"
                                        // Порядковый номер карточки — по нему CSS сдвигает
                                        // начало её анимации, чтобы ряд появлялся волной.
                                        style={{ ['--card-index' as string]: index }}
                                    >
                                        {/* Ссылка накрывает карточку целиком: кнопки покупки
                                            в списке больше нет, и клик в любое место должен
                                            открывать товар. Заголовок ниже остаётся настоящей
                                            ссылкой — её читают поисковики и скринридеры. */}
                                        <Link
                                            to={`/games/${gameSlug}`}
                                            className="catalog-game-hit"
                                            aria-label={`Open ${game.title}`}
                                            onClick={() => handleRecordViewed(game)}
                                        />
                                        <div className="catalog-game-image">
                                            {renderImage(game)}
                                            {/* Скидка, платформы и цена — тот же компонент, что на полках главной. */}
                                            <GameCoverOverlay
                                                game={game}
                                                chip={game.isComingSoon ? 'Coming soon' : null}
                                                discountCorner="left"
                                            />
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

                                        {/* Низ карточки — две плотные строки: название и строка
                                            «жанр + оценка + покупка». Всё, что уместилось на обложке
                                            (цена, скидка, платформы), сюда не дублируется — обложка
                                            и должна занимать почти всю карточку. */}
                                        <div className="catalog-game-body">
                                            <h3 className="catalog-game-title">
                                                <Link to={`/games/${gameSlug}`} onClick={() => handleRecordViewed(game)}>
                                                    {game.title}
                                                </Link>
                                            </h3>

                                            {/* Строка шире карточки, и пустое место в ней выглядит
                                                недоделкой. Показываем то, что в сетку не помещается:
                                                короткое описание, платформы и год выхода. */}
                                            {viewMode === 'list' && (
                                                <>
                                                    {game.description && (
                                                        <p className="catalog-game-tagline">{game.description}</p>
                                                    )}
                                                    <div className="catalog-game-facts">
                                                        {(game.platforms ?? [])
                                                            .filter((platform) => platformGlyphs[platform])
                                                            .map((platform) => (
                                                                <span key={platform} title={platform}>
                                                                    <FontAwesomeIcon icon={platformGlyphs[platform]} />
                                                                    {platform}
                                                                </span>
                                                            ))}
                                                        {game.releaseDate && (
                                                            <span>{new Date(game.releaseDate).getFullYear()}</span>
                                                        )}
                                                        {typeof game.rating === 'number' && (
                                                            <span>
                                                                {game.reviewCount}{' '}
                                                                {game.reviewCount === 1 ? 'review' : 'reviews'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </>
                                            )}

                                            <div className="catalog-game-meta">
                                                <span className="catalog-game-chip">{game.category}</span>
                                                {/* Оценка появляется только у игр с отзывами: «0.0 ★» отпугивает
                                                    сильнее, чем честное отсутствие оценки. */}
                                                {typeof game.rating === 'number' && (
                                                    <span className="catalog-game-rating" title={`${game.reviewCount} reviews`}>
                                                        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor">
                                                            <path d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z" />
                                                        </svg>
                                                        {game.rating.toFixed(1)}
                                                    </span>
                                                )}
                                                {game.lowStockLeft ? (
                                                    <span className="catalog-game-low">{game.lowStockLeft} left</span>
                                                ) : null}

                                                {/* Кнопки покупки в списке нет: карточка ведёт на товар,
                                                    где видны издания, ключи и остаток. Справа остаётся
                                                    только то, что мешает купить, — это сведения,
                                                    а не действие. */}
                                                {game.isComingSoon ? (
                                                    <span
                                                        className="catalog-game-note"
                                                        title="Not released yet — wishlist it to catch the launch"
                                                    >
                                                        {formatReleaseDate(game.releaseDate) ?? 'Coming soon'}
                                                    </span>
                                                ) : soldOut ? (
                                                    <span className="catalog-game-note catalog-game-note-out">Out of stock</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                            {paginatedGames.length === 0 && !isLoading && (
                                <div className="col-span-full rounded-[16px] border border-dashed border-[#e6e1ff] bg-white/70 py-12 text-center text-sm text-[#8a81b5]">
                                    {hasActiveFilters
                                        ? 'No games match these filters. Try removing one above.'
                                        : 'The catalog is empty right now.'}
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
                    {/* Заголовок обещает только то, что мы действительно делаем: счётчик
                        покупателей появится здесь, когда его будет чем подтвердить. */}
                    <div className="max-w-2xl">
                        <h2 className="text-2xl font-semibold text-[#2b2350]">What every order includes</h2>
                        <p className="mt-1 text-lg text-[#6f64a8]">the same for a $5 key and a $60 one</p>
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

                {/* Рейтинг магазина считается по настоящим отзывам покупателей.
                    Пока их нет, блок честно говорит об этом, а не показывает красивые цифры. */}
                <section className="mt-10 rounded-[22px] border border-[#ece8ff] bg-white/80 p-6 shadow-[0_18px_36px_rgba(108,85,164,0.14)]">
                    {reviewSummary.count === 0 ? (
                        <div className="py-6 text-center">
                            <h2 className="text-xl font-semibold text-[#2b2350]">No reviews yet</h2>
                            <p className="mx-auto mt-2 max-w-md text-sm text-[#6f64a8]">
                                Ratings here come from verified purchases only. Buy a game and yours will be
                                the first one other players see.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl font-semibold text-[#2b2350]">
                                        {reviewSummary.average.toFixed(1)}
                                    </span>
                                    <StarRow rating={reviewSummary.average} className="h-4 w-4" />
                                    <span className="text-sm text-[#6f64a8]">
                                        {reviewSummary.count.toLocaleString('en-US')}{' '}
                                        {reviewSummary.count === 1 ? 'review' : 'reviews'}
                                    </span>
                                </div>
                                {reviewSummary.quotes.length > 0 && (
                                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                                        {reviewSummary.quotes.map((quote, index) => (
                                            <div
                                                key={`${quote.author}-${quote.createdAt}-${index}`}
                                                className="rounded-[16px] border border-[#efeaff] bg-white px-4 py-4"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6b3ff2] text-sm font-semibold text-white">
                                                        {(quote.author ?? '?').trim().charAt(0).toUpperCase() || '?'}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-[#2b2350]">{quote.author}</p>
                                                        <StarRow rating={quote.rating} className="h-3 w-3" />
                                                    </div>
                                                </div>
                                                <p className="mt-3 text-sm text-[#6f64a8]">{quote.text}</p>
                                                {quote.gameTitle && (
                                                    <p className="mt-2 text-xs text-[#8a81b5]">
                                                        on{' '}
                                                        {quote.gameSlug ? (
                                                            <Link
                                                                to={`/games/${slugify(quote.gameSlug)}`}
                                                                className="font-semibold text-[#6b3ff2]"
                                                            >
                                                                {quote.gameTitle}
                                                            </Link>
                                                        ) : (
                                                            <span className="font-semibold">{quote.gameTitle}</span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="rounded-[16px] border border-[#efeaff] bg-[#fbf9ff] p-4">
                                <div className="space-y-2">
                                    {[5, 4, 3, 2, 1].map((star) => {
                                        const count = reviewSummary.distribution[String(star)] ?? 0;
                                        const share = Math.round((count / reviewSummary.count) * 100);
                                        return (
                                            <div key={star} className="flex items-center gap-3 text-sm text-[#6f64a8]">
                                                <span className="w-4 text-right font-semibold text-[#2b2350]">{star}</span>
                                                <div className="flex flex-1 items-center gap-2">
                                                    <div className="h-2 flex-1 rounded-full bg-[#e6e1ff]">
                                                        <div className="h-2 rounded-full bg-[#6b3ff2]" style={{ width: `${share}%` }} />
                                                    </div>
                                                    <span className="w-8 text-right text-xs text-[#6f64a8]">{share}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                <section className="mt-12 overflow-hidden rounded-[26px]">
                    <div className="relative flex min-h-[260px] flex-col items-center justify-center rounded-[26px] bg-[linear-gradient(135deg,#141b33_0%,#3b2a69_55%,#2b1a49_100%)] px-6 py-12 text-center text-white shadow-[0_24px_48px_rgba(20,15,50,0.3)]">
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,16,40,0.35)_0%,rgba(54,38,100,0.55)_60%,rgba(20,16,40,0.85)_100%)]" />
                        <div className="relative z-10 max-w-2xl">
                            <h2 className="text-3xl font-semibold md:text-4xl">Not sure what to play?</h2>
                            <p className="mt-3 text-base text-white/80">Start from what other players are buying, or from what costs least.</p>
                            <div className="mt-6 flex flex-wrap justify-center gap-3">
                                <button
                                    type="button"
                                    className="rounded-[12px] bg-[#6b3ff2] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(107,63,242,0.35)]"
                                    onClick={() => {
                                        clearAllFilters('popular');
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                >
                                    Popular this week
                                </button>
                                <Link
                                    to="/deals"
                                    className="rounded-[12px] border border-white/30 bg-white/90 px-6 py-2.5 text-sm font-semibold text-[#3d2f74] shadow-[0_12px_24px_rgba(12,10,30,0.2)]"
                                >
                                    View Deals
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default TaleGameshopGameList;
