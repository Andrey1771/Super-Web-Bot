import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Game } from '../../models/game';
import Cover from './Cover';
import HoverTrailer from './HoverTrailer';
import { normalizeGameCoverUrl } from '../../utils/game-cover';
import GameCoverOverlay from './GameCoverOverlay';
import { useWishlist } from '../../context/wishlist-context';
import { formatReleaseDate } from '../../utils/format-release-date';
import { licenseText, productHref } from '../../utils/software';
import { regionBadgeText, regionLineText } from '../../utils/region-text';
import './store-game-card.css';

/** Адрес товара в его разделе (/games или /software). Считается из slug, а при его отсутствии — из названия. */
export const storeGameHref = (game: Game) => productHref(game);

export interface StoreGameCardProps {
    game: Game;
    /** База для картинок обложки. */
    baseUrl: string;
    /** Номер в сетке: по нему сдвигается начало анимации, чтобы ряд появлялся волной. */
    index?: number;
    /** Метка в левом верхнем углу обложки (дата релиза, ценовая категория). */
    coverChip?: string | null;
    /** Угол бейджа скидки. По умолчанию левый — справа живёт кнопка вишлиста. */
    discountCorner?: 'left' | 'right';
    /** Что ещё положить поверх обложки — например, обратный отсчёт до конца скидки. */
    coverExtra?: React.ReactNode;
    /** Что добавить в низ карточки между названием и строкой «жанр + оценка». */
    bodyExtra?: React.ReactNode;
    /** Сердечко нужно не везде: в подборках, где вишлист не к месту, его можно убрать. */
    showWishlist?: boolean;
    /** Вызывается при открытии товара — сюда вешают аналитику и «недавно смотрели». */
    onOpen?: () => void;
}

/**
 * Карточка товара витрины: обложка с ценой поверх неё, под обложкой название и строка
 * «жанр + оценка». Одна на весь магазин — каталог и страница скидок рисуют её этим
 * компонентом. Раньше у каждой страницы была своя копия разметки, и они разъезжались:
 * на скидках карточка так и осталась в прежнем виде (обложка 16:10, цена отдельным
 * блоком, кнопка покупки), пока каталог ушёл вперёд.
 *
 * Классы остались от каталога (`catalog-game-*`): их знают его же правила списочного
 * вида, и переименование ничего бы не дало, кроме риска.
 */
const StoreGameCard: React.FC<StoreGameCardProps> = ({
    game,
    baseUrl,
    index = 0,
    coverChip = null,
    discountCorner = 'left',
    coverExtra,
    bodyExtra,
    showWishlist = true,
    onOpen,
}) => {
    const { t } = useTranslation();
    const { isWishlisted, toggle: toggleWishlist } = useWishlist();
    const href = storeGameHref(game);
    const wishlisted = isWishlisted(game.id);
    const soldOut = game.inStock === false;

    return (
        <article className="catalog-game-card group" style={{ ['--card-index' as string]: index }}>
            {/* Ссылка накрывает карточку целиком: кнопки покупки в листинге нет, и клик в любое
                место должен открывать товар. Заголовок ниже остаётся настоящей ссылкой — её
                читают поисковики и скринридеры. */}
            <Link to={href} className="catalog-game-hit" aria-label={`Open ${game.title}`} onClick={onOpen} />
            {/* Квадратная рамка: картинка обрезается под неё, а не растягивает карточку. Размеры для srcset —
                по ширине колонки сетки, чтобы плитка не тянула исходник. */}
            <Cover
                className="catalog-game-image"
                ratio="square"
                sizes="(max-width: 640px) 48vw, (max-width: 1100px) 30vw, 280px"
                title={game.title}
                src={game.imagePath}
                baseUrl={baseUrl}
                imgClassName="pointer-events-none"
            >
                {/* Трейлер при наведении — сразу после картинки, чтобы бейджи и цена остались сверху. */}
                <HoverTrailer src={normalizeGameCoverUrl(game.trailerUrl, baseUrl)} poster={normalizeGameCoverUrl(game.trailerPosterUrl, baseUrl)} title={game.title} />
                <GameCoverOverlay
                    game={game}
                    chip={coverChip ?? (game.isComingSoon ? t('common.comingSoon') : null)}
                    discountCorner={discountCorner}
                />
                {coverExtra}
                {showWishlist && (
                    <button
                        type="button"
                        className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[#6f64a8] shadow-sm transition pointer-events-auto ${
                            wishlisted ? 'border-[#1f2937] text-[#1f2937]' : 'hover:text-[#6b3ff2]'
                        }`}
                        aria-label={wishlisted ? t('common.removeFromWishlist') : t('common.addToWishlist')}
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
                )}
            </Cover>

            {/* Низ карточки — две плотные строки: название и строка «жанр + оценка + статус».
                Всё, что уместилось на обложке (цена, скидка, платформы), сюда не дублируется —
                обложка и должна занимать почти всю карточку. */}
            <div className="catalog-game-body">
                <h3 className="catalog-game-title">
                    <Link to={href} onClick={onOpen}>
                        {game.title}
                    </Link>
                </h3>

                {/* У ПО под названием — его раздел («VPN & privacy»): жанра у программы нет,
                    а понять, что это за программа, по одному названию удаётся не всегда. */}
                {game.kind === 'Software' && game.category && (
                    <span className="catalog-game-subtitle">{game.category}</span>
                )}

                {/* Регион — свойство товара, а не настройка покупателя: где ключ активируется,
                    видно до клика. Красным — только когда точно известно, что стране покупателя
                    он не подходит. */}
                {game.region && (
                    <span
                        className={`catalog-game-region${game.region.allowed === false ? ' is-blocked' : ''}`}
                        title={regionLineText(game.region)}
                    >
                        {game.region.allowed === false ? t('common.notForYourCountry') : regionBadgeText(game.region)}
                    </span>
                )}

                {bodyExtra}

                <div className="catalog-game-meta">
                    {/* У ПО вместо жанра — лицензия, чья цена на обложке, и сколько ещё вариантов. */}
                    {game.license ? (
                        <>
                            <span
                                className={`catalog-game-chip is-license${game.license.isSubscription ? ' is-subscription' : ''}`}
                                title={licenseText(game.license)}
                            >
                                {licenseText(game.license)}
                            </span>
                            {(game.licenseCount ?? 0) > 1 && (
                                <span className="catalog-game-more">
                                    {t('common.moreLicenses', { count: (game.licenseCount ?? 0) - 1 })}
                                </span>
                            )}
                        </>
                    ) : game.kind !== 'Software' ? (
                        <span className="catalog-game-chip">{game.category}</span>
                    ) : null}
                    {/* Оценка появляется только у игр с отзывами: «0.0 ★» отпугивает сильнее,
                        чем честное отсутствие оценки. */}
                    {typeof game.rating === 'number' && (
                        <span className="catalog-game-rating" title={t('common.reviewsCount', { count: game.reviewCount ?? 0 })}>
                            <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor">
                                <path d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z" />
                            </svg>
                            {game.rating.toFixed(1)}
                        </span>
                    )}
                    {game.lowStockLeft ? <span className="catalog-game-low">{t('common.leftInStock', { count: game.lowStockLeft })}</span> : null}

                    {/* Справа остаётся только то, что мешает купить, — это сведения, а не действие. */}
                    {game.isComingSoon ? (
                        <span
                            className="catalog-game-note"
                            title={t('common.notReleasedYet')}
                        >
                            {formatReleaseDate(game.releaseDate) ?? t('common.comingSoon')}
                        </span>
                    ) : soldOut ? (
                        <span className="catalog-game-note catalog-game-note-out">{t('common.outOfStock')}</span>
                    ) : null}
                </div>
            </div>
        </article>
    );
};

export default StoreGameCard;
