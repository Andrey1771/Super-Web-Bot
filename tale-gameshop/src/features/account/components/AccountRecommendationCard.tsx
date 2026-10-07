import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Game } from '../../../models/game';
import type { Product } from '../../../reducers/cart-reducer';
import Cover from '../../../components/common/Cover';
import HoverTrailer from '../../../components/common/HoverTrailer';
import { useCart } from '../../../context/cart-context';
import { useSitePreferences } from '../../../context/site-preferences';
import { formatMoney } from '../../../utils/format-money';
import { productHref } from '../../../utils/software';
import './account-recommendation-card.css';

/**
 * Карточка рекомендации в кабинете — одна на «Обзор» и «Заказы». Раньше у каждой страницы была своя копия, и
 * обе никуда не вели: кликалась только кнопка, а курсор над карточкой оставался стрелкой. На «Заказах» не работала
 * и кнопка. Теперь карточка целиком — ссылка на игру, как плитка каталога; кнопка «В корзину» лежит поверх ссылки.
 */
const AccountRecommendationCard: React.FC<{ game: Game }> = ({ game }) => {
    const { t } = useTranslation();
    const { currency } = useSitePreferences();
    const { dispatch } = useCart();
    const href = productHref(game);
    // Цена со скидкой — та же, что спишут: карточка не должна обещать одну сумму, а класть в корзину другую.
    const price = Number(game.finalPrice ?? game.price);

    return (
        <div className="account-recommendation-card" data-hover-trailer-root="">
            <Link to={href} className="account-recommendation-hit" aria-label={t('account.orders.openItem', { title: game.title })} />
            <Cover className="account-recommendation-media" ratio="landscape" sizes="(max-width: 640px) 45vw, 220px" src={game.imagePath} title={game.title}>
                <HoverTrailer src={game.trailerUrl} poster={game.trailerPosterUrl} title={game.title} />
            </Cover>
            <div className="account-recommendation-body">
                {/* title: название обрезается двумя строками, полное остаётся доступным при наведении. */}
                <Link to={href} className="account-recommendation-title" title={game.title}>
                    {game.title}
                </Link>
                <span className="account-recommendation-price">{formatMoney(price, game.currency ?? currency)}</span>
            </div>
            <button
                type="button"
                className="btn btn-primary account-recommendation-btn"
                disabled={!game.id || Boolean(game.isComingSoon)}
                onClick={() =>
                    dispatch({
                        type: 'ADD_TO_CART',
                        payload: {
                            gameId: game.id ?? '',
                            slug: game.slug,
                            name: game.title ?? game.name,
                            price,
                            quantity: 1,
                            image: game.imagePath
                        } as Product
                    })
                }
            >
                {t('common.addToCart')}
            </button>
        </div>
    );
};

export default AccountRecommendationCard;
