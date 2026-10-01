import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate as formatLocalDate } from '../../../i18n/format';
import {Link} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faMagnifyingGlass,
    faChevronLeft,
    faChevronRight,
    faArrowLeft,
    faArrowRight
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import IDENTIFIERS from '../../../constants/identifiers';
import container from '../../../inversify.config';
import { Game } from '../../../models/game';
import type { IGameService } from '../../../iterfaces/i-game-service';
import { useWishlist } from '../../../context/wishlist-context';
import { useCart } from '../../../context/cart-context';
import { Product } from '../../../reducers/cart-reducer';
import { useViewedGames } from '../../../hooks/use-viewed-games';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import { useSitePreferences } from '../../../context/site-preferences';
import { formatMoney } from '../../../utils/format-money';
import Cover from '../../../components/common/Cover';
import HoverTrailer from '../../../components/common/HoverTrailer';
import { slugify } from '../../../utils/slugify';
import './account-saved-items-page.css';

const PAGE_SIZE = 6;

/** Сколько недавно просмотренных игр в ленте: она листается, так что можно больше, чем помещается. */
const VIEWED_LIMIT = 12;

/**
 * Стрелки для горизонтальной ленты: листают на видимую ширину и гаснут у краёв.
 * Лента рисуется внутри RecommendationsSection, поэтому ищем её в обёртке по классу.
 */
const useHorizontalScroll = (containerRef: React.RefObject<HTMLElement | null>, itemCount: number) => {
    const [edges, setEdges] = useState({ start: true, end: true });

    const list = useCallback(
        () => containerRef.current?.querySelector<HTMLElement>('.saved-horizontal-list') ?? null,
        [containerRef]
    );

    const update = useCallback(() => {
        const element = list();
        if (!element) {
            setEdges({ start: true, end: true });
            return;
        }
        const maxScroll = element.scrollWidth - element.clientWidth;
        setEdges({ start: element.scrollLeft <= 1, end: element.scrollLeft >= maxScroll - 1 });
    }, [list]);

    useEffect(() => {
        const element = list();
        update();
        if (!element) {
            return;
        }
        element.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            element.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, [list, update, itemCount]);

    const scrollBy = (direction: 1 | -1) => {
        const element = list();
        element?.scrollBy({ left: direction * element.clientWidth, behavior: 'smooth' });
    };

    return { atStart: edges.start, atEnd: edges.end, scrollBy };
};

const AccountSavedItemsPage: React.FC = () => {
    const { t } = useTranslation();
    const { currency } = useSitePreferences();
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'all' | 'price' | 'newest'>('all');
    const [page, setPage] = useState(1);
    const [games, setGames] = useState<Game[]>([]);
    const { ids: wishlistIds, remove } = useWishlist();
    const gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
    const { dispatch } = useCart();
    // Рекомендаций здесь нет: тот же блок есть на обзоре кабинета, а на странице списка он
    // дублировал его и вместе с «Недавно просмотренными» давал два ряда по шесть карточек.
    const {
        items: viewedItems,
        isLoading: isViewedLoading,
        error: viewedError,
        reload: reloadViewed
    } = useViewedGames(VIEWED_LIMIT);
    const viewedRowRef = useRef<HTMLElement>(null);
    const viewedScroll = useHorizontalScroll(viewedRowRef, viewedItems.length);

    // Тянем только то, что в списке желаний, а не весь каталог: страница показывает ровно
    // эти игры, а каталог магазина растёт независимо от размера списка.
    useEffect(() => {
        const ids = Array.from(wishlistIds);
        if (ids.length === 0) {
            setGames([]);
            return;
        }
        let cancelled = false;
        (async () => {
            const loaded = await Promise.all(
                // Игру могли снять с продажи — пропускаем её, а не роняем всю страницу.
                ids.map((id) =>
                    gameService.getGameById(id).catch((error) => {
                        // Игры больше нет в каталоге — убираем её из списка. Иначе счётчик в меню
                        // кабинета продолжал бы её считать (у гостя список живёт в браузере, и
                        // сервер его не почистит). Сетевую ошибку за удаление не принимаем.
                        if (error?.response?.status === 404) {
                            void remove(id);
                        }
                        return null;
                    })
                )
            );
            if (!cancelled) {
                setGames(loaded.filter(Boolean) as Game[]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [gameService, wishlistIds, remove]);

    const wishlistGames = useMemo(
        () => games.filter((game) => game.id && wishlistIds.has(game.id)),
        [games, wishlistIds]
    );

    const totalWishlistItems = wishlistGames.length;

    const filteredGames = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const filtered = query
            ? wishlistGames.filter((game) => (game.title || game.name || '').toLowerCase().includes(query))
            : wishlistGames;

        const sorted = [...filtered];
        if (sortOrder === 'price') {
            sorted.sort((a, b) => Number(a.price) - Number(b.price));
        } else if (sortOrder === 'newest') {
            sorted.sort((a, b) => new Date(b.releaseDate).valueOf() - new Date(a.releaseDate).valueOf());
        }
        return sorted;
    }, [wishlistGames, searchQuery, sortOrder]);

    const totalFiltered = filteredGames.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

    // Если фильтр или удаление сократили список — не зависаем на несуществующей странице.
    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const safePage = Math.min(page, totalPages);
    const wishlistCards = useMemo(
        () => filteredGames.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
        [filteredGames, safePage]
    );

    const showingFrom = totalFiltered === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(safePage * PAGE_SIZE, totalFiltered);
    const visibleLabel =
        totalFiltered === 0 ? t('common.showingZero') : t('common.showingRange', { from: showingFrom, to: showingTo, total: totalFiltered });

    const formatPrice = (price: number) => formatMoney(Number.isFinite(price) ? price : 0, currency);

    const formatDate = (releaseDate: string) => {
        const date = new Date(releaseDate);
        return Number.isNaN(date.valueOf()) ? t('account.saved.releaseTbd') : formatLocalDate(date, {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const gameHref = (game: Game) =>
        `/games/${game.slug ? slugify(game.slug) : slugify(game.title || game.name)}`;

    const handleRemove = async (gameId?: string) => {
        if (!gameId) {
            return;
        }
        await remove(gameId);
    };

    const handleAddToCart = (game: Game) => {
        if (game.isComingSoon) {
            return;
        }
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: game.id ?? '',
                slug: game.slug,
                name: game.title ?? game.name,
                price: game.price,
                quantity: 1,
                image: game.imagePath
            } as Product
        });
    };




    return (
        <AccountShell
            title={t('account.saved.title', { count: totalWishlistItems })}
            sectionLabel={t('account.saved.section')}
            subtitle={t('account.saved.subtitle')}
        >
            {/* Тулбар — строка на фоне страницы, а не карточка: раньше он сидел в своей рамке, список — в своей,
                а товар — в третьей, и страница читалась как набор вложенных коробок. Теперь рамок нет вовсе:
                список разделён линиями, плитки держит воздух. */}
            <div className="saved-toolbar" data-testid="saved-toolbar">
                <label className="saved-search">
                    <FontAwesomeIcon icon={faMagnifyingGlass} className="saved-search-icon" aria-hidden="true" />
                    <input
                        type="text"
                        placeholder={t('account.saved.searchPlaceholder')}
                        aria-label={t('account.saved.search')}
                        value={searchQuery}
                        onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setPage(1);
                        }}
                    />
                </label>

                <div className="saved-view-toggle" role="group" aria-label={t('account.saved.viewMode')}>
                    <button
                        type="button"
                        className={`saved-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
                        aria-pressed={viewMode === 'list'}
                        onClick={() => setViewMode('list')}
                    >
                        {t('common.list')}
                    </button>
                    <button
                        type="button"
                        className={`saved-view-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                        aria-pressed={viewMode === 'grid'}
                        onClick={() => setViewMode('grid')}
                    >
                        {t('common.grid')}
                    </button>
                </div>

                <select
                    className="saved-select"
                    aria-label={t('account.saved.sort')}
                    value={sortOrder}
                    onChange={(event) => {
                        setSortOrder(event.target.value as 'all' | 'price' | 'newest');
                        setPage(1);
                    }}
                >
                    <option value="all">{t('common.all')}</option>
                    <option value="price">{t('common.price')}</option>
                    <option value="newest">{t('common.newest')}</option>
                </select>

                <span className="saved-toolbar-note">{visibleLabel}</span>
            </div>

            {wishlistCards.length === 0 ? (
                <div className="saved-empty-state" data-testid="saved-grid">
                    <p>
                        {totalWishlistItems === 0
                            ? t('account.saved.empty')
                            : t('account.saved.noMatch')}
                    </p>
                </div>
            ) : viewMode === 'list' ? (
                <div className="saved-list" data-testid="saved-grid">
                    {wishlistCards.map((item, index) => (
                        <div key={item.id ?? `${item.title}-${index}`} className="saved-row">
                            <Link to={gameHref(item)} className="saved-row-cover" aria-label={t('account.orders.openItem', { title: item.title })}>
                                <Cover ratio="wide" sizes="(max-width: 640px) 40vw, 180px" src={item.imagePath} title={item.title} imgClassName="saved-item-image" />
                            </Link>
                            <div className="saved-row-main">
                                <Link to={gameHref(item)} className="saved-item-title-link">
                                    <strong>{item.title}</strong>
                                </Link>
                                <span className="saved-item-date">{formatDate(item.releaseDate)}</span>
                            </div>
                            <span className="saved-row-price">{formatPrice(item.price)}</span>
                            <div className="saved-row-actions">
                                {item.isComingSoon ? (
                                    <button
                                        type="button"
                                        className="btn btn-outline saved-item-btn"
                                        disabled
                                        title={t('account.saved.notReleased')}
                                    >
                                        {t('common.comingSoon')}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn-primary saved-item-btn"
                                        onClick={() => handleAddToCart(item)}
                                    >
                                        {t('common.addToCart')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn saved-item-remove"
                                    onClick={() => handleRemove(item.id)}
                                >
                                    {t('common.remove')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="saved-grid" data-testid="saved-grid">
                    {wishlistCards.map((item, index) => (
                        <article key={item.id ?? `${item.title}-${index}`} className="saved-tile">
                            <Link to={gameHref(item)} className="saved-tile-cover" aria-label={t('account.orders.openItem', { title: item.title })}>
                                <Cover ratio="wide" sizes="(max-width: 640px) 100vw, (max-width: 1100px) 45vw, 320px" src={item.imagePath} title={item.title} imgClassName="saved-item-image" />
                            </Link>
                            <div className="saved-tile-head">
                                <div className="saved-tile-title">
                                    <Link to={gameHref(item)} className="saved-item-title-link">
                                        <strong>{item.title}</strong>
                                    </Link>
                                    <span className="saved-item-date">{formatDate(item.releaseDate)}</span>
                                </div>
                                <span className="saved-row-price">{formatPrice(item.price)}</span>
                            </div>
                            <div className="saved-tile-actions">
                                {item.isComingSoon ? (
                                    <button
                                        type="button"
                                        className="btn btn-outline saved-item-btn"
                                        disabled
                                        title={t('account.saved.notReleased')}
                                    >
                                        {t('common.comingSoon')}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn-primary saved-item-btn"
                                        onClick={() => handleAddToCart(item)}
                                    >
                                        {t('common.addToCart')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn saved-item-remove"
                                    onClick={() => handleRemove(item.id)}
                                >
                                    {t('common.remove')}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
            {totalPages > 1 && (
                <div className="saved-pagination" data-testid="saved-pagination">
                    <div className="saved-pagination-controls">
                        <button
                            type="button"
                            className="btn btn-outline saved-page-btn"
                            aria-label={t('common.previousPage')}
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={safePage <= 1}
                        >
                            <FontAwesomeIcon icon={faChevronLeft} />
                        </button>
                        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                            <button
                                key={pageNumber}
                                type="button"
                                className={`btn btn-outline saved-page-btn ${pageNumber === safePage ? 'is-active' : ''}`}
                                onClick={() => setPage(pageNumber)}
                            >
                                {pageNumber}
                            </button>
                        ))}
                        <button
                            type="button"
                            className="btn btn-outline saved-page-btn"
                            aria-label={t('common.nextPage')}
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={safePage >= totalPages}
                        >
                            <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                    </div>
                    <span className="saved-pagination-note">{visibleLabel}</span>
                </div>
            )}

            <section className="saved-recently-viewed" data-testid="saved-recently-viewed" ref={viewedRowRef}>
                <div className="saved-section-header">
                    <h3>{t('account.saved.recentlyViewed')}</h3>
                    {!(viewedScroll.atStart && viewedScroll.atEnd) && (
                        <div className="saved-section-arrows">
                            <button
                                type="button"
                                className="btn btn-outline saved-arrow-btn"
                                aria-label={t('common.scrollLeft')}
                                onClick={() => viewedScroll.scrollBy(-1)}
                                disabled={viewedScroll.atStart}
                            >
                                <FontAwesomeIcon icon={faArrowLeft} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline saved-arrow-btn"
                                aria-label={t('common.scrollRight')}
                                onClick={() => viewedScroll.scrollBy(1)}
                                disabled={viewedScroll.atEnd}
                            >
                                <FontAwesomeIcon icon={faArrowRight} />
                            </button>
                        </div>
                    )}
                </div>
                <RecommendationsSection
                    items={viewedItems}
                    isLoading={isViewedLoading}
                    error={viewedError}
                    onRetry={reloadViewed}
                    emptyMessage={t('account.saved.browseToSee')}
                    listClassName={`saved-horizontal-list${viewedScroll.atStart ? '' : ' is-fade-start'}${viewedScroll.atEnd ? '' : ' is-fade-end'}`}
                    stateClassName="saved-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`viewed-skeleton-${index}`} className="card saved-horizontal-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="card saved-horizontal-card" data-hover-trailer-root="">
                            <Link to={gameHref(item.game)} className="saved-horizontal-link" aria-label={t('account.orders.openItem', { title: item.game.title })}>
                                <Cover className="saved-horizontal-cover" ratio="landscape" sizes="(max-width: 640px) 70vw, 220px" src={item.game.imagePath} title={item.game.title}>
                                    <HoverTrailer src={item.game.trailerUrl} poster={item.game.trailerPosterUrl} title={item.game.title} />
                                </Cover>
                            </Link>
                            <div className="saved-horizontal-body">
                                <Link to={gameHref(item.game)} className="saved-horizontal-title">{item.game.title}</Link>
                                <span className="saved-horizontal-subtitle">
                                    {formatLocalDate(item.lastViewedAt)}
                                </span>
                                <span className="saved-horizontal-price">
                                    {/* Цены в выбранной валюте нет — сервер отдаёт null; это не «бесплатно». */}
                                    {item.game.price == null
                                        ? t('common.unavailable')
                                        : formatMoney(Number(item.game.price), item.game.currency ?? currency)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary saved-horizontal-btn"
                                disabled={!item.game.id || Boolean(item.game.isComingSoon) || item.game.price == null}
                                onClick={() => handleAddToCart(item.game)}
                            >
                                {t('common.addToCart')}
                            </button>
                        </div>
                    )}
                />
            </section>
        </AccountShell>
    );
};

export default AccountSavedItemsPage;
