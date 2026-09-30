import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import IDENTIFIERS from '../../constants/identifiers';
import './game-list-page.css';
import container from '../../inversify.config';
import { Game } from '../../models/game';
import type { IUrlService } from '../../iterfaces/i-url-service';
import type { IKeycloakService } from '../../iterfaces/i-keycloak-service';
import type { IRecommendationsService } from '../../iterfaces/i-recommendations-service';

import { analyticsClient } from '../../utils/analytics-client';
import { ITEM_LISTS, trackItemSelect, useItemListView } from "../../utils/item-list-tracking";
import { slugify } from '../../utils/slugify';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faAndroid, faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons';
import { useSoftwareCategories } from '../../hooks/use-software-categories';
import { findGenreBySlug, useGameGenres } from '../../hooks/use-game-genres';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { kindLabels } from '../../utils/product-kind-labels';
import { PLATFORM_ICONS } from '../common/GameCoverOverlay';
import {
    activationLabel,
    devicesLabel,
    gamesCatalogPath,
    GAMES_TYPE_VALUE,
    productHref,
    SOFTWARE_CATEGORY_PARAM,
    SOFTWARE_TYPE_PARAM,
    SOFTWARE_TYPE_VALUE,
    softwareCatalogPath,
    termLabel
} from '../../utils/software';
import { useSitePreferences } from '../../context/site-preferences';
import { formatMoney } from '../../utils/format-money';
import PageMeta from '../common/PageMeta';
import StoreGameCard from '../common/StoreGameCard';
import Breadcrumbs, { type Crumb } from '../common/Breadcrumbs';
import PriceRangeFilter from './PriceRangeFilter';
import SortSelect, { type SortOption } from '../common/SortSelect';
import {
    EMPTY_CATALOG_PAGE,
    getCatalogPage,
    type CatalogPage,
    type FacetCount
} from '../../api/catalogApi';

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
const SORT_OPTIONS: { value: string; key: string }[] = [
    { value: 'popular', key: 'popular' },
    { value: 'discount', key: 'discount' },
    { value: 'rating', key: 'rating' },
    { value: 'reviews', key: 'reviews' },
    { value: 'new', key: 'new' },
    { value: 'price-asc', key: 'priceAsc' },
    { value: 'price-desc', key: 'priceDesc' },
    { value: 'name-asc', key: 'nameAsc' },
    { value: 'name-desc', key: 'nameDesc' }
];

/**
 * Как покупатели на самом деле ищут игры: какие фильтры и какую сортировку выбирают.
 *
 * Отправляется не сам набор параметров, а только имена включённых фильтров и порядок
 * сортировки. Значения (искомая строка, границы цены) не уходят намеренно: они превращают
 * событие в бесконечный список неповторяющихся значений, который в отчётах бесполезен, а
 * строку поиска Google и так получает отдельным событием search.
 *
 * Смена страницы фильтром не считается — иначе перелистывание выглядело бы как поиск.
 */
const FILTER_EVENT_IGNORED = new Set(['page', 'view']);

let lastFilterSignature: string | null = null;

const trackCatalogFilters = (params: URLSearchParams) => {
    const active = Array.from(params.keys())
        .filter((key) => !FILTER_EVENT_IGNORED.has(key) && (params.get(key) ?? '').trim().length > 0)
        .sort();

    const signature = active.join(',') + '|' + (params.get('sortBy') ?? '');
    if (signature === lastFilterSignature) {
        return;
    }
    lastFilterSignature = signature;

    // Пустой набор — это сброс фильтров, а не их применение: событие незачем.
    if (active.length === 0) {
        return;
    }

    analyticsClient.trackEvent('catalog_filter_applied', {
        filters: active.join(','),
        filter_count: active.length,
        sort_by: params.get('sortBy') ?? 'default',
    });
};

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
    'inStock',
    'studio',
    'tag',
    'terms',
    'devices',
    'activation',
    SOFTWARE_CATEGORY_PARAM,
    // Тип товара — тоже фильтр: сброс возвращает весь каталог.
    SOFTWARE_TYPE_PARAM
];

/** Параметры, которые имеют смысл только у игр или только у софта: при смене типа их убираем. */
const GAME_ONLY_PARAMS = ['categories', 'filterCategory'];
const SOFTWARE_ONLY_PARAMS = ['terms', 'devices', 'activation', SOFTWARE_CATEGORY_PARAM];

/** Значки систем в фильтре ПО «Works on». */
const osGlyphs: Record<string, IconDefinition> = {
    Windows: faWindows,
    macOS: faApple,
    Linux: faLinux,
    Android: faAndroid,
    iOS: faApple
};

/**
 * Кнопки-сегменты фильтра ПО (срок, устройства): вариантов немного, и они читаются рядом быстрее списка.
 * Вариант без товаров, если он не выбран, не показывается — как и строки обычных фильтров.
 */
const SegmentFilter: React.FC<{
    facets: FacetCount[];
    selected: string[];
    label: (value: string) => string;
    onToggle: (value: string) => void;
    ariaLabel: string;
}> = ({ facets, selected, label, onToggle, ariaLabel }) => (
    <div className="catalog-segments" role="group" aria-label={ariaLabel}>
        {facets
            .filter((facet) => facet.count > 0 || selected.includes(facet.value))
            .map((facet) => {
                const active = selected.includes(facet.value);
                return (
                    <button
                        key={facet.value}
                        type="button"
                        className={active ? 'is-active' : ''}
                        aria-pressed={active}
                        title={i18n.t('catalog.products', { count: facet.count })}
                        onClick={() => onToggle(facet.value)}
                    >
                        {label(facet.value)}
                    </button>
                );
            })}
    </div>
);

/**
 * Что показывает каталог /games: всё сразу (по умолчанию), только игры (?type=games) или только софт
 * (?type=software). Выбирается фильтром «Product type»; разметка общая, различаются фильтры и подписи.
 */
export type CatalogKind = 'all' | 'game' | 'software';

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

type FilterOptionItem = {
    key: string;
    label: string;
    count: number;
    checked: boolean;
    onToggle: () => void;
    icon?: IconDefinition;
};

/** Сколько строк длинного списка видно сразу. */
const COLLAPSED_OPTIONS = 5;
/** С какой длины список сворачивается: прятать одну-две строки за кнопкой — лишний клик, а не экономия места. */
const COLLAPSE_FROM = 8;

/**
 * Список вариантов фильтра, длинный — свёрнутым: первые пять и «Show all N». Жанров, категорий и систем бывает
 * по десятку, и панель фильтров становилась вдвое выше окна. Отмеченный вариант виден всегда, даже в свёрнутом
 * списке: иначе снятый с глаз фильтр продолжал бы молча сужать выдачу.
 */
const FilterOptionList: React.FC<{ options: FilterOptionItem[] }> = ({ options }) => {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    // Пустые варианты FilterOption не рисует — и считать их в «Show all» незачем.
    const visible = options.filter((option) => option.count > 0 || option.checked);
    const collapsible = visible.length >= COLLAPSE_FROM;
    const shown = !collapsible || expanded
        ? visible
        : visible.filter((option, index) => index < COLLAPSED_OPTIONS || option.checked);

    return (
        <div className="catalog-filter-options">
            {shown.map((option) => (
                <FilterOption
                    key={option.key}
                    label={option.label}
                    count={option.count}
                    checked={option.checked}
                    onToggle={option.onToggle}
                    icon={option.icon}
                />
            ))}
            {collapsible && (expanded || shown.length < visible.length) && (
                <button
                    type="button"
                    className="catalog-filter-more"
                    aria-expanded={expanded}
                    onClick={() => setExpanded((value) => !value)}
                >
                    {expanded ? t('common.showLess') : t('common.showAll', { count: visible.length })}
                </button>
            )}
        </div>
    );
};


const TaleGameshopGameList: React.FC<{ kind?: CatalogKind }> = ({ kind = 'game' }) => {
    const { t } = useTranslation();
    const sortOptions = useMemo<SortOption[]>(
        () => SORT_OPTIONS.map((option) => ({ value: option.value, label: t(`catalog.sort.${option.key}`) })),
        [t]
    );
    const software = kind === 'software';
    const gamesOnly = kind === 'game';
    const section = software ? softwareCatalogPath() : gamesOnly ? gamesCatalogPath() : '/games';
    // Что лежит в выдаче — для подписей: «12 games» только когда в ней одни игры, иначе «12 products».
    const noun = (count: number) => (gamesOnly ? t('catalog.games', { count }) : t('catalog.products', { count }));
    const nounPlural = gamesOnly ? t('kind.game.nounPlural') : t('catalog.productsPlural');
    const softwareCategories = useSoftwareCategories();
    // Жанры — ради страницы жанра: её адрес — код жанра, а название приходит из админки и может меняться.
    const { genres: gameGenres } = useGameGenres();
    const { currency, country } = useSitePreferences();
    // Страница каталога целиком приходит с сервера: и товар, и счётчики фильтров.
    const [catalog, setCatalog] = useState<CatalogPage>(EMPTY_CATALOG_PAGE);
    const [isLoading, setIsLoading] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();
    // Непусто — открыта посадочная страница жанра (/games/category/action) или категория софта (?softwareCategory=security).
    const { categorySlug: routeCategorySlug } = useParams<{ categorySlug: string }>();
    const categorySlug = software ? searchParams.get(SOFTWARE_CATEGORY_PARAM) || undefined : routeCategorySlug;
    const navigate = useNavigate();

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
    // Со страницы товара: «ещё игры студии» и клик по тегу — точные совпадения, а не поиск.
    const studioFilter = searchParams.get('studio') ?? '';
    const tagFilter = searchParams.get('tag') ?? '';
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
        if (software) {
            // Режим софта: вид товара и категория (?softwareCategory=security), плюс фильтры лицензий.
            request.set('kind', 'software');
            if (categorySlug) {
                request.set('softwareCategory', categorySlug);
            }
            copy('terms', 'terms');
            copy('devices', 'devices');
            copy('activation', 'activation');
        } else {
            // Весь каталог — оба вида товара; только игры — вид по умолчанию на сервере, параметр не нужен.
            if (!gamesOnly) {
                request.set('kind', 'all');
            }
            copy('categories', 'categories');
            copy('filterCategory', 'categoryQuery');
            if (categorySlug) {
                request.set('categorySlug', categorySlug);
            }
        }
        copy('platforms', 'platforms');
        copy('filterMinPrice', 'minPrice');
        copy('filterMaxPrice', 'maxPrice');
        // Галочки в адресе страницы хранятся как «1» — так ссылка короче. Сервер же ждёт
        // настоящее булево: на «1» он отвечал 400 «The value '1' is not valid», страница
        // ловила ошибку и показывала пустую выдачу. Со стороны это выглядело как фильтр,
        // который всегда находит ноль игр.
        const flag = (from: string, to: string) => {
            if (searchParams.get(from) === '1') {
                request.set(to, 'true');
            }
        };

        flag('onSale', 'onSale');
        flag('inStock', 'inStock');
        flag('comingSoon', 'comingSoon');
        copy('studio', 'studio');
        copy('tag', 'tag');
        // Валюта из адресной строки важнее выбранной в шапке — так ссылкой на каталог в евро
        // можно поделиться. В остальных случаях берём валюту покупателя: цены считает сервер,
        // и без неё в запросе смена валюты меняла бы только значок, а не сами цены.
        copy('currency', 'currency');
        if (!request.has('currency')) {
            request.set('currency', currency);
        }
        request.set('sort', searchParams.get('sortBy') ?? 'popular');
        request.set('page', String(Math.max(1, Number(searchParams.get('page') ?? 1))));
        request.set('pageSize', String(PAGE_SIZE));

        return request;
        // country в адрес запроса не попадает — он уходит заголовком X-Buyer-Country. Но в
        // зависимостях нужен: от страны зависит доступность ключа («не для вашей страны»), и
        // без него смена страны в шапке меняла только флажок, а выдача оставалась прежней.
    }, [searchParams, categorySlug, currency, country, software, gamesOnly]);

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
            } catch (error) {
                // Пустая выдача и отказ сервера выглядят одинаково — «ничего не найдено».
                // Поэтому пишем причину в консоль: молчание здесь однажды уже спрятало то,
                // что фильтры вовсе не доходили до сервера.
                console.error('Catalog request failed', error);
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

    const patchSearchParams = useCallback(
        (patchFn: (params: URLSearchParams) => void, options?: { replace?: boolean }) => {
            setSearchParams((previous) => {
                const params = new URLSearchParams(previous);
                patchFn(params);
                trackCatalogFilters(params);
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

    const clearAllFilters = () => {
        setSearchNameDraft('');
        patchSearchParams((params) => {
            FILTER_PARAM_NAMES.forEach((name) => params.delete(name));
        });
    };

    const categoryOptions = useMemo(
        () => catalog.facets.categories.map((facet) => facet.value),
        [catalog.facets.categories]
    );

    // Подпись жанра на языке сайта; значение фильтра (в адресе и галочках) остаётся английским.
    const categoryLabel = (value: string) =>
        catalog.facets.categories.find((facet) => facet.value === value)?.label
            ?? gameGenres.find((genre) => genre.title === value)?.label
            ?? value;

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
        // У ПО жанров нет: категория раздела задаётся адресом и плитками, а не галочками.
        if (software) {
            return [];
        }
        // На посадочной странице жанр задан адресом — он и есть выбранная категория.
        if (categorySlug) {
            const known = findGenreBySlug(gameGenres, categorySlug)?.title
                ?? categoryOptions.find((category) => slugify(category) === categorySlug);
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
    }, [software, categorySlug, explicitCategories, categoryQuery, categoryOptions, gameGenres]);

    const hasCategoryFilter = Boolean(categorySlug) || explicitCategories.length > 0 || Boolean(categoryQuery);

    /**
     * Переключение категории в сайдбаре. Подстрочный фильтр из ссылки при первом же клике
     * разворачивается в точный набор и удаляется — дальше состояние однозначное.
     *
     * С посадочной страницы жанра уводим в общий каталог: там категория задана адресом,
     * и оставить её вместе с выбором в сайдбаре значило бы показывать два разных фильтра
     * как один.
     */
    /**
     * Смена типа товара. Фильтры чужого типа убираем сразу: жанр «Puzzle» у антивируса ничего не найдёт,
     * а срок лицензии у игры не бывает. Платформы тоже: у игр это PC и консоли, у софта — системы.
     */
    const setProductType = (next: CatalogKind) => {
        patchSearchParams((params) => {
            if (next === 'all') {
                params.delete(SOFTWARE_TYPE_PARAM);
            } else {
                params.set(SOFTWARE_TYPE_PARAM, next === 'software' ? SOFTWARE_TYPE_VALUE : GAMES_TYPE_VALUE);
            }
            if (next === 'software') {
                GAME_ONLY_PARAMS.forEach((name) => params.delete(name));
            } else {
                SOFTWARE_ONLY_PARAMS.forEach((name) => params.delete(name));
            }
            params.delete('platforms');
            params.delete('page');
        });
    };

    /**
     * Галочки «Games» и «Software». Отмечены обе — весь каталог. Снять последнюю нельзя в пустоту:
     * пустой выбор означает «ничего не ограничивать», то есть снова весь каталог.
     */
    const toggleProductType = (which: 'game' | 'software') => {
        const gamesOn = which === 'game' ? kind === 'software' : kind !== 'software';
        const softwareOn = which === 'software' ? kind === 'game' : kind !== 'game';
        setProductType(gamesOn === softwareOn ? 'all' : gamesOn ? 'game' : 'software');
    };

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
                // Жанр есть только у игр: в общем каталоге он и так оставляет одни игры, и галочка «Software»
                // иначе стояла бы отмеченной при выдаче без единой программы.
                if (kind === 'all') {
                    params.set(SOFTWARE_TYPE_PARAM, GAMES_TYPE_VALUE);
                }
            } else {
                params.delete('categories');
            }
            params.set('page', '1');
        });
    };

    /**
     * Категория ПО. В режиме софта — обычный фильтр (одна категория, повторный клик снимает). В общем каталоге —
     * ещё и переход к софту: категория бывает только у программ. Игровые фильтры при этом уходят (жанры, платформы —
     * у софта вместо них системы).
     */
    const toggleSoftwareCategory = (tag: string) => {
        patchSearchParams((params) => {
            if (tag === categorySlug) {
                params.delete(SOFTWARE_CATEGORY_PARAM);
            } else {
                params.set(SOFTWARE_CATEGORY_PARAM, tag);
                if (!software) {
                    params.set(SOFTWARE_TYPE_PARAM, SOFTWARE_TYPE_VALUE);
                    GAME_ONLY_PARAMS.forEach((name) => params.delete(name));
                    params.delete('platforms');
                }
            }
            params.delete('page');
        });
    };

    const availablePrices = catalog.priceRange;

    /**
     * Группа категорий ПО. Порядок — из настроек раздела, числа — из выдачи (с учётом поиска и
     * остальных фильтров); пустые категории FilterOption прячет сам.
     */
    const softwareCategoryGroup = (title: string) => {
        if (!softwareCategories.categories.some((category) => category.count > 0)) {
            return null;
        }
        return (
            <div className="catalog-filter-group">
                <h3 className="catalog-filter-title">{title}</h3>
                <FilterOptionList
                    options={softwareCategories.categories.map((category) => ({
                        key: category.tag,
                        label: category.label ?? category.title,
                        checked: category.tag === categorySlug,
                        count: facetCountOf(catalog.facets.software?.categories ?? [], category.tag),
                        onToggle: () => toggleSoftwareCategory(category.tag),
                    }))}
                />
            </div>
        );
    };

    const selectedPlatforms = useMemo(() => {
        return (searchParams.get('platforms') ?? '')
            .split(',')
            .map((platform) => platform.trim())
            .filter(Boolean);
    }, [searchParams]);

    /** Значения списочного параметра адреса (`?terms=12,24`). */
    const listParam = useCallback(
        (name: string) =>
            (searchParams.get(name) ?? '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
        [searchParams]
    );
    const selectedTerms = useMemo(() => listParam('terms'), [listParam]);
    const selectedDevices = useMemo(() => listParam('devices'), [listParam]);
    const selectedActivation = useMemo(() => listParam('activation'), [listParam]);

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


    const paginatedGames = catalog.items;

    // Показ каталога: смена страницы или фильтра — новый показ, повторный рендер тем же
    // составом — нет (хук сравнивает содержимое, а не ссылку на массив).
    useItemListView(
        ITEM_LISTS.catalog,
        paginatedGames.map((game) => ({
            id: game.id,
            title: game.title ?? game.name,
            price: game.finalPrice ?? game.price,
            category: game.gameType ? String(game.gameType) : null,
        })),
        currency,
    );
    // Первая загрузка — это когда показывать ещё нечего. Отличается от загрузки следующей
    // страницы, где прежняя выдача остаётся на месте и просто приглушается.
    //
    // Разница видна только на медленном интернете, и там она дорогая: пустая сетка вместе
    // с «0 games» и «Showing 0–0 of 0» читается как «в магазине нет игр», а не как
    // «идёт загрузка». Человек уходит, не дождавшись, и уверен, что смотреть тут нечего.
    const isFirstLoad = isLoading && paginatedGames.length === 0;

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
    const hasFiltersBeyondType =
        hasCategoryFilter ||
        Boolean(filterName) ||
        Boolean(studioFilter) ||
        Boolean(tagFilter) ||
        selectedPlatforms.length > 0 ||
        selectedTerms.length > 0 ||
        selectedDevices.length > 0 ||
        selectedActivation.length > 0 ||
        comingSoonOnly ||
        onSaleOnly ||
        inStockOnly ||
        priceNarrowed ||
        sortBy !== DEFAULT_SORT;

    // Сужение по типу товара — такой же фильтр: «Reset filters» возвращает весь каталог.
    const hasActiveFilters = kind !== 'all' || hasFiltersBeyondType;

    /**
     * Блок «наличие и предложения» — первым в сайдбаре: это те вопросы, с которыми
     * покупатель приходит («что со скидкой», «что можно купить прямо сейчас»),
     * а не уточнения после выбора жанра.
     */
    const availabilityFilters = useMemo(
        () => [
            { param: 'inStock', label: t('catalog.inStock'), active: inStockOnly, count: catalog.facets.availability.inStock },
            { param: 'onSale', label: t('catalog.onSale'), active: onSaleOnly, count: catalog.facets.availability.onSale },
            {
                param: 'comingSoon',
                label: t('common.comingSoon'),
                active: comingSoonOnly,
                count: catalog.facets.availability.comingSoon
            }
        ],
        [inStockOnly, onSaleOnly, comingSoonOnly, catalog.facets.availability, t]
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

        const softwareCategory = software ? softwareCategories.categories.find((category) => category.tag === categorySlug) : undefined;
        const genre = software ? undefined : findGenreBySlug(gameGenres, categorySlug);
        const known = software
            ? softwareCategory?.label ?? softwareCategory?.title
            : genre?.label ?? genre?.title
                ?? categoryOptions.map(categoryLabel).find((category, index) => slugify(categoryOptions[index]) === categorySlug);
        return known ?? categorySlug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    }, [software, softwareCategories.categories, categorySlug, categoryOptions, gameGenres]);

    const sectionLabel = software ? t('common.nav.software') : gamesOnly ? t('common.games') : t('common.catalog');

    const breadcrumbs = useMemo<Crumb[]>(() => {
        const trail: Crumb[] = [{ label: t('common.nav.home'), to: '/' }];

        if (landingCategory) {
            trail.push({ label: sectionLabel, to: section }, { label: landingCategory });
        } else {
            trail.push({ label: sectionLabel });
        }

        return trail;
    }, [landingCategory, sectionLabel, section, t]);

    /**
     * Заголовок, описание и служебные теги страницы.
     *
     * Отфильтрованные и постраничные виды прячем из поиска: это тот же товар в другом
     * порядке, и в индексе такие страницы конкурируют сами с собой. Канонический адрес
     * при этом указывает на чистую страницу — вес ссылок достаётся ей.
     */
    const pageMeta = useMemo(() => {
        const basePath = software
            ? softwareCatalogPath(landingCategory ? categorySlug : undefined)
            // Канонический адрес жанра — его код, даже если открыли по slug названия.
            : landingCategory ? `/games/category/${findGenreBySlug(gameGenres, categorySlug)?.tag ?? categorySlug}` : '/games';
        // В индекс — весь каталог и раздел софта (у него свой заголовок); «только игры» дублирует каталог,
        // а любые фильтры сверх типа — это тот же товар в другом порядке.
        const isPlainListing = !hasFiltersBeyondType && !gamesOnly && safeCurrentPage === 1;

        const title = software
            ? landingCategory
                ? t('catalog.meta.softwareCategoryTitle', { category: landingCategory })
                : t('catalog.meta.softwareTitle')
            : landingCategory
                ? t('catalog.categoryGames', { category: landingCategory })
                : gamesOnly
                    ? t('catalog.meta.gamesTitle')
                    : t('catalog.meta.allTitle');
        const description = software
            ? landingCategory
                ? t('catalog.meta.softwareCategoryDesc', { category: landingCategory.toLowerCase() })
                : t('catalog.meta.softwareDesc')
            : landingCategory
                ? t('catalog.meta.gamesCategoryDesc', { category: landingCategory.toLowerCase() })
                : gamesOnly
                    ? t('catalog.meta.gamesDesc')
                    : t('catalog.meta.allDesc');

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
                      url: `${window.location.origin}${productHref(game)}`,
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
    }, [software, gamesOnly, landingCategory, categorySlug, hasFiltersBeyondType, safeCurrentPage, paginatedGames, totalResults, catalog.pageSize, gameGenres, t]);

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
                // В общем каталоге платформы игровые — выбор оставляет одни игры, и галочки типа говорят то же.
                if (kind === 'all') {
                    params.set(SOFTWARE_TYPE_PARAM, GAMES_TYPE_VALUE);
                }
            } else {
                params.delete('platforms');
            }
            params.set('page', '1');
        });
    };

    /** Переключение значения списочного фильтра ПО: срок, устройства, активация. */
    const toggleListValue = (name: string, current: string[], value: string) => {
        const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

        updateParams((params) => {
            if (next.length > 0) {
                params.set(name, next.join(','));
            } else {
                params.delete(name);
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

        if (kind !== 'all') {
            chips.push({
                key: 'type',
                label: software ? t('catalog.softwareOnly') : t('catalog.gamesOnly'),
                remove: () => setProductType('all')
            });
        }

        // Порядок выдачи тоже попадает в чипы — но только когда он отличается от обычного.
        // Иначе строка висела бы всегда и предлагала «сбросить» то, что и так по умолчанию.
        if (sortBy !== DEFAULT_SORT) {
            chips.push({
                key: 'sort',
                label: sortOptions.find((option) => option.value === sortBy)?.label ?? sortBy,
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
            chips.push({ key: `category:${category}`, label: categoryLabel(category), remove: () => toggleCategory(category) })
        );

        if (studioFilter) {
            chips.push({
                key: 'studio',
                label: t('catalog.studioChip', { studio: studioFilter }),
                remove: () =>
                    updateParams((params) => {
                        params.delete('studio');
                        params.set('page', '1');
                    })
            });
        }

        if (tagFilter) {
            chips.push({
                key: 'tag',
                label: `#${tagFilter}`,
                remove: () =>
                    updateParams((params) => {
                        params.delete('tag');
                        params.set('page', '1');
                    })
            });
        }

        selectedPlatforms.forEach((platform) =>
            chips.push({ key: `platform:${platform}`, label: platform, remove: () => togglePlatform(platform) })
        );

        selectedTerms.forEach((term) =>
            chips.push({ key: `term:${term}`, label: termLabel(term), remove: () => toggleListValue('terms', selectedTerms, term) })
        );
        selectedDevices.forEach((devices) =>
            chips.push({ key: `devices:${devices}`, label: devicesLabel(devices), remove: () => toggleListValue('devices', selectedDevices, devices) })
        );
        selectedActivation.forEach((target) =>
            chips.push({ key: `activation:${target}`, label: activationLabel(target), remove: () => toggleListValue('activation', selectedActivation, target) })
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
                label: `${formatMoney(Number(minPriceFilter), currency, {compact: true})} – ${formatMoney(Number(maxPriceFilter), currency, {compact: true})}`,
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
    }, [kind, sortBy, filterName, studioFilter, tagFilter, activeCategories, selectedPlatforms, selectedTerms, selectedDevices, selectedActivation, availabilityFilters, priceNarrowed, minPriceFilter, maxPriceFilter, sortOptions, t]);

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
                        <h1>
                            {software
                                ? landingCategory ?? t('common.nav.software')
                                : landingCategory ? t('catalog.categoryGames', { category: landingCategory }) : gamesOnly ? t('common.games') : t('common.catalog')}
                        </h1>
                        <span className="catalog-head-count">
                            {isFirstLoad
                                ? <span className="catalog-count-skeleton" aria-hidden="true" />
                                : noun(totalResults)}
                        </span>
                    </div>
                    {filterName && (
                        <p className="catalog-head-note">
                            {t('catalog.resultsFor')} <strong>{filterName}</strong>
                        </p>
                    )}
                    {studioFilter && !filterName && (
                        <p className="catalog-head-note">
                            {t('catalog.gamesBy')} <strong>{studioFilter}</strong>
                        </p>
                    )}
                    {tagFilter && !filterName && !studioFilter && (
                        <p className="catalog-head-note">
                            {t('catalog.tagged')} <strong>{tagFilter}</strong>
                        </p>
                    )}
                </div>

                <section className="catalog-layout">
                    <aside className="catalog-sidebar">
                        <div className="catalog-sidebar-scroll">
                        <div className="catalog-sidebar-head">
                            <h2>{t('common.filters')}</h2>
                            {hasActiveFilters && (
                                <span className="catalog-sidebar-count">{activeFilterChips.length}</span>
                            )}
                        </div>

                        {/* Тип товара — первым: это главный вопрос, с которым приходят («мне игру или программу»).
                            Отмечены обе галочки — весь каталог. Блок скрыт, пока софт не продаётся. */}
                        {(software || facetCountOf(catalog.facets.kinds ?? [], 'Software') > 0) && (
                            <div className="catalog-filter-group">
                                <h3 className="catalog-filter-title">{t('catalog.productType')}</h3>
                                <div className="catalog-filter-options">
                                    <FilterOption
                                        label={t('common.games')}
                                        checked={kind !== 'software'}
                                        count={facetCountOf(catalog.facets.kinds ?? [], 'Game')}
                                        onToggle={() => toggleProductType('game')}
                                    />
                                    <FilterOption
                                        label={t('common.nav.software')}
                                        checked={kind !== 'game'}
                                        count={facetCountOf(catalog.facets.kinds ?? [], 'Software')}
                                        onToggle={() => toggleProductType('software')}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Категории ПО — фильтром в сайдбаре, а не плитками над выдачей: плитки появлялись только
                            у софта и при переключении типа сдвигали всю страницу вниз, вместе с галочкой под курсором.
                            Порядок — из настроек раздела, числа — из выдачи. Категория одна: выбор другой заменяет её. */}
                        {software && softwareCategoryGroup(t('catalog.softwareCategory'))}

                        <div className="catalog-filter-group">
                            <h3 className="catalog-filter-title">{t('catalog.availability')}</h3>
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
                            <h3 className="catalog-filter-title">{t('catalog.price')}</h3>
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
                                        // Подпись собираем из границ в валюте покупателя: сервер
                                        // присылает её с долларом всегда, и в евро кнопка «Under $10»
                                        // фильтровала по 10 евро, а называлась долларами.
                                        const money = (value: number) => formatMoney(value, currency, {compact: true});
                                        const label = preset.to === null
                                            ? t('catalog.priceAndUp', { price: money(preset.from) })
                                            : preset.from === 0
                                                ? t('catalog.priceUnder', { price: money(preset.to) })
                                                : `${money(preset.from)} – ${money(preset.to)}`;
                                        const active =
                                            priceNarrowed &&
                                            minPriceFilter === preset.from &&
                                            maxPriceFilter === upper;

                                        return (
                                            <button
                                                key={`${preset.from}-${preset.to ?? 'max'}`}
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
                                                <span>{label}</span>
                                                <span className="price-preset-count">{preset.count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {software && (catalog.facets.software?.terms.length ?? 0) > 0 && (
                            <div className="catalog-filter-group">
                                <h3 className="catalog-filter-title">{t('catalog.licenseTerm')}</h3>
                                <SegmentFilter
                                    ariaLabel={t('catalog.licenseTerm')}
                                    facets={catalog.facets.software?.terms ?? []}
                                    selected={selectedTerms}
                                    label={termLabel}
                                    onToggle={(value) => toggleListValue('terms', selectedTerms, value)}
                                />
                            </div>
                        )}

                        {software && (catalog.facets.software?.devices.length ?? 0) > 0 && (
                            <div className="catalog-filter-group">
                                <h3 className="catalog-filter-title">{t('catalog.devices')}</h3>
                                <SegmentFilter
                                    ariaLabel={t('catalog.devices')}
                                    facets={catalog.facets.software?.devices ?? []}
                                    selected={selectedDevices}
                                    label={(value) => value}
                                    onToggle={(value) => toggleListValue('devices', selectedDevices, value)}
                                />
                            </div>
                        )}

                        <div className="catalog-filter-group">
                            <h3 className="catalog-filter-title">{kindLabels(software).platforms}</h3>
                            <FilterOptionList
                                options={catalog.facets.platforms.map((facet) => ({
                                    key: facet.value,
                                    label: facet.value,
                                    icon: software ? osGlyphs[facet.value] : PLATFORM_ICONS[facet.value],
                                    checked: selectedPlatforms.includes(facet.value),
                                    count: facet.count,
                                    onToggle: () => togglePlatform(facet.value),
                                }))}
                            />
                            {catalog.facets.platforms.length === 0 && !isFirstLoad && (
                                <p className="text-sm text-[#8a81b5]">{t('catalog.noPlatformData')}</p>
                            )}
                        </div>

                        {software ? (
                            (catalog.facets.software?.activation.length ?? 0) > 0 && (
                                <div className="catalog-filter-group">
                                    <h3 className="catalog-filter-title">{t('catalog.activatesOn')}</h3>
                                    <div className="catalog-filter-options">
                                        {(catalog.facets.software?.activation ?? []).map((facet) => (
                                            <FilterOption
                                                key={facet.value}
                                                label={activationLabel(facet.value)}
                                                checked={selectedActivation.includes(facet.value)}
                                                count={facet.count}
                                                onToggle={() => toggleListValue('activation', selectedActivation, facet.value)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="catalog-filter-group">
                                <h3 className="catalog-filter-title">{kind === 'all' ? t('catalog.gameGenres') : t('catalog.categories')}</h3>
                                <FilterOptionList
                                    options={categoryOptions.map((category) => ({
                                        key: category,
                                        label: categoryLabel(category),
                                        checked: activeCategories.includes(category),
                                        count: facetCountOf(catalog.facets.categories, category),
                                        onToggle: () => toggleCategory(category),
                                    }))}
                                />
                            </div>
                        )}

                        {/* В общем каталоге категории софта — после жанров: выбор переводит каталог в режим софта. */}
                        {kind === 'all' && softwareCategoryGroup(t('catalog.softwareCategories'))}

                        {/* Кнопки «применить» нет намеренно: фильтры срабатывают сразу,
                            и она лишь создавала бы впечатление незавершённого действия. */}
                        <button
                            className="catalog-filter-reset"
                            onClick={() => clearAllFilters()}
                            disabled={!hasActiveFilters}
                        >
                            {t('catalog.resetFilters')}
                        </button>
                        </div>
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
                                        placeholder={software ? t('catalog.searchSoftware') : gamesOnly ? t('catalog.searchGames') : t('catalog.searchAll')}
                                        aria-label={software ? t('catalog.searchSoftwareAria') : gamesOnly ? t('catalog.searchGamesAria') : t('catalog.searchAllAria')}
                                        value={searchNameDraft}
                                        onChange={handleSearchChange}
                                    />
                                </label>

                                <SortSelect
                                    options={sortOptions}
                                    caption={t('common.sort')}
                                    value={sortBy}
                                    onChange={(next) =>
                                        updateParams((params) => {
                                            params.set('sortBy', next);
                                            params.set('page', '1');
                                        })
                                    }
                                />

                                {/* Вид — не фильтр, поэтому «Reset filters» его не трогает. */}
                                <div className="catalog-view" role="group" aria-label={t('catalog.viewMode')}>
                                    <button
                                        type="button"
                                        className={viewMode === 'grid' ? 'is-active' : ''}
                                        aria-pressed={viewMode === 'grid'}
                                        title={t('common.grid')}
                                        onClick={() => updateParams((params) => params.delete('view'))}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                                            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                                            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                                            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                                        </svg>
                                        <span className="sr-only-label">{t('common.grid')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={viewMode === 'list' ? 'is-active' : ''}
                                        aria-pressed={viewMode === 'list'}
                                        title={t('common.list')}
                                        onClick={() => updateParams((params) => params.set('view', 'list'))}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                        </svg>
                                        <span className="sr-only-label">{t('common.list')}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Условие — сам список чипов, а не отдельный флаг: так строка
                                и её содержимое не могут разойтись. */}
                            {activeFilterChips.length > 0 && (
                                <div className="catalog-toolbar-row catalog-chosen">
                                    <span className="catalog-chosen-label">{t('catalog.chosenFilters')}</span>
                                    {/* Каждый включённый фильтр — со своим крестиком: снять один,
                                        не сбрасывая остальные. */}
                                    {activeFilterChips.map((chip) => (
                                        <button
                                            key={chip.key}
                                            type="button"
                                            className="catalog-filter-chip"
                                            onClick={chip.remove}
                                            aria-label={t('catalog.removeFilter', { label: chip.label })}
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
                                        {t('common.clearAll')}
                                    </button>
                                </div>
                            )}

                            <p className="catalog-results-label">
                                {isFirstLoad
                                    ? t('catalog.loading', { items: nounPlural })
                                    : t('catalog.showing', { from: showingFrom, to: showingTo, items: noun(totalResults) })}
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
                            {paginatedGames.map((game, index) => (
                                <StoreGameCard
                                    key={game.id ?? `game-${index}`}
                                    game={game}
                                    baseUrl={services.urlService.apiBaseUrl}
                                    index={index}
                                    // Справа у карточки кнопка вишлиста — скидку уводим влево.
                                    discountCorner="left"
                                    onOpen={() => {
                                        handleRecordViewed(game);
                                        trackItemSelect(
                                            ITEM_LISTS.catalog,
                                            {
                                                id: game.id,
                                                title: game.title ?? game.name,
                                                price: game.finalPrice ?? game.price,
                                                category: game.gameType ? String(game.gameType) : null,
                                            },
                                            index,
                                            game.currency,
                                        );
                                    }}
                                    // Строка шире карточки, и пустое место в ней выглядит недоделкой.
                                    // В списочном виде показываем то, что в сетку не помещается:
                                    // короткое описание, платформы и год выхода.
                                    bodyExtra={viewMode === 'list' ? (
                                        <>
                                            {game.description && (
                                                <p className="catalog-game-tagline">{game.description}</p>
                                            )}
                                            <div className="catalog-game-facts">
                                                {(game.platforms ?? [])
                                                    .filter((platform) => PLATFORM_ICONS[platform])
                                                    .map((platform) => (
                                                        <span key={platform} title={platform}>
                                                            <FontAwesomeIcon icon={PLATFORM_ICONS[platform]} />
                                                            {platform}
                                                        </span>
                                                    ))}
                                                {game.releaseDate && (
                                                    <span>{new Date(game.releaseDate).getFullYear()}</span>
                                                )}
                                                {typeof game.rating === 'number' && (
                                                    <span>
                                                        {t('common.reviewsCount', { count: game.reviewCount ?? 0 })}
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    ) : null}
                                />
                            ))}
                            {/* Каркас будущих карточек: сетка сразу занимает своё место и
                                показывает, ЧТО именно грузится. Восемь штук — примерно
                                первый экран, дальше догружать нечего показывать. */}
                            {isFirstLoad && Array.from({length: 8}).map((_, index) => (
                                <div key={`skeleton-${index}`} className="catalog-card-skeleton" aria-hidden="true">
                                    <div className="catalog-card-skeleton__cover" />
                                    <div className="catalog-card-skeleton__line" />
                                    <div className="catalog-card-skeleton__line is-short" />
                                </div>
                            ))}
                            {paginatedGames.length === 0 && !isLoading && (
                                <div className="col-span-full rounded-[16px] border border-dashed border-[#e6e1ff] bg-white/70 py-12 text-center text-sm text-[#8a81b5]">
                                    {hasActiveFilters
                                        ? t('catalog.noMatch', { items: nounPlural })
                                        : software
                                            ? t('catalog.noSoftwareYet')
                                            : t('catalog.empty')}
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
            </main>
        </div>
    );
};

export default TaleGameshopGameList;
