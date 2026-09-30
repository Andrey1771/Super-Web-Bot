import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { tierName } from '../../../utils/cashback';
import { formatDate } from '../../../i18n/format';
import {Link, useNavigate} from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
    faBagShopping,
    faCreditCard,
    faKey,
    faHeart,
    faCoins,
    faHourglassHalf
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import {accountProfile} from '../mockAccountData';
import { useAccountProfile } from '../context/AccountProfileContext';
import {useCart} from '../../../context/cart-context';
import { useRecommendations } from '../../../hooks/use-recommendations';
import { useGameKeys } from '../../../hooks/use-game-keys';
import { useOrders } from '../../../hooks/use-orders';
import { useWishlistSummary } from '../../../hooks/use-wishlist-summary';
import { usePaymentMethodsSummary } from '../../../hooks/use-payment-methods-summary';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import Cover from '../../../components/common/Cover';
import HoverTrailer from '../../../components/common/HoverTrailer';
import { useSitePreferences } from '../../../context/site-preferences';
import { formatMoney, formatOrderMoney } from '../../../utils/format-money';
import { useCashbackStatus } from '../../../hooks/use-cashback-status';
import { tierIcon } from '../cashback-icons';
import './account-overview-page.css';
import './account-rewards-page.css';

/** «Sep 24» — дата разблокировки кэшбэка; год здесь лишний, это ближайшие недели. */
const formatShortDate = (iso: string) => formatDate(iso.length === 10 ? `${iso}T00:00:00` : iso, { month: 'short', day: 'numeric' });

/** Дата заказа. Пустое или битое значение показываем прочерком, а не «Invalid Date». */
const formatOrderDate = (value?: string | null) => {
    if (!value) {
        return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return formatDate(date);
};

const AccountOverviewPage: React.FC = () => {
    const { t } = useTranslation();
    const { currency } = useSitePreferences();
    const cashback = useCashbackStatus();
    // Уровень и суммы — с сервера, в валюте его ответа (для валюты без курса это доллары).
    const cashbackMoney = (value: number) => formatMoney(value, cashback.currency);
    const cashbackTier = cashback.level.tiers.find((item) => item.id === cashback.level.tierId) ?? cashback.level.tiers[0];
    const cashbackNext = cashback.level.tiers.find((item) => item.id === cashback.level.nextTierId) ?? null;
    const {dispatch} = useCart();
    const navigate = useNavigate();
    const {
        items: orders,
        totalCount: ordersTotal,
        isLoading: isOrdersLoading,
        error: ordersError,
        reload: reloadOrders
    } = useOrders({ limit: 3 });
    const {
        items: recommendations,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(4);
    const {
        items: keys,
        isLoading: isKeysLoading,
        error: keysError,
        reload: reloadKeys
    } = useGameKeys(3);
    const {
        count: wishlistCount,
        isLoading: isWishlistLoading,
        error: wishlistError,
        reload: reloadWishlist
    } = useWishlistSummary();
    const {
        count: paymentMethodsCount,
        isLoading: isPaymentMethodsLoading,
        error: paymentMethodsError,
        reload: reloadPaymentMethods
    } = usePaymentMethodsSummary();

    const ordersSummary = ordersError
        ? t('common.unavailable')
        : isOrdersLoading
            ? t('common.loading')
            : t('account.overview.orders', { count: ordersTotal });
    const keysSummary = keysError
        ? t('common.unavailable')
        : isKeysLoading
            ? t('common.loading')
            : t('account.overview.activeKeys', { count: keys.length });
    const savedSummary = wishlistError
        ? t('common.unavailable')
        : isWishlistLoading
            ? t('common.loading')
            : t('account.overview.items', { count: wishlistCount });
    const billingSummary = paymentMethodsError
        ? t('common.unavailable')
        : isPaymentMethodsLoading
            ? t('common.loading')
            : t('account.overview.methods', { count: paymentMethodsCount });

    // Кнопка вела в console.log. Открываем заказ там, где он показан целиком, — на «Orders»,
    // отфильтрованных по его номеру: сервер ищет в том числе по OrderNumber.
    const handleViewOrder = (orderId: string) => {
        navigate(`/account/orders?q=${encodeURIComponent(orderId)}`);
    };

    const handleViewKeys = (keyId?: string) => {
        if (keyId) {
            navigate(`/account/keys#${keyId}`);
            return;
        }
        navigate('/account/keys');
    };

    const handleAddToCart = (id: string, title: string, price: number, image: string) => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: id,
                name: title,
                price,
                quantity: 1,
                image
            }
        });
    };

    const { profile } = useAccountProfile();
    const displayName = profile?.displayName ?? accountProfile.name;
    const email = profile?.email ?? accountProfile.email;

    return (
        <AccountShell
            title={t('account.overview.title')}
            sectionLabel={t('account.overview.title')}
            subtitle={t('account.overview.subtitle')}
        >
            <div className="card account-card account-profile-card">
                <div className="account-profile-summary">
                    <AccountProfileSummary />
                    <div>
                        <h2>{displayName}</h2>
                        <p className="account-profile-email">{email}</p>
                        {/* Честный бейдж: только при реальных покупках (раньше показывался всем из мока). */}
                        {!isOrdersLoading && ordersTotal > 0 && <span className="badge">{t('account.verifiedBuyer')}</span>}
                    </div>
                </div>
                <Link to="/account/settings" className="btn btn-primary account-action-btn">
                    {t('account.overview.editProfile')}
                </Link>
            </div>

            {/* Кэшбэк отдельной полосой, а не пятой плиткой среди «Orders/Keys/Saved/Billing»:
                там всё — разделы, куда можно сходить, а тут число, ради которого сюда заходят.
                Слева — сколько есть, справа — почему столько и сколько до следующего уровня.
                Данные из того же хука, что и на /account/rewards. */}
            <Link to="/account/rewards" className="card account-card cb-overview">
                <span className="cb-icon" aria-hidden="true">
                    <FontAwesomeIcon icon={faCoins} />
                </span>
                <div className="cb-overview-balance">
                    <span className="cb-label">{t('account.overview.cashbackAvailable')}</span>
                    <strong className="cb-overview-value">{cashbackMoney(cashback.available)}</strong>
                    {cashback.pending > 0 && (
                        <span className="cb-overview-pending">
                            <FontAwesomeIcon icon={faHourglassHalf} />
                            {t('account.overview.pending', { amount: cashbackMoney(cashback.pending) })}
                            {cashback.nextUnlockAt && t('account.overview.unlocks', { date: formatShortDate(cashback.nextUnlockAt) })}
                        </span>
                    )}
                </div>
                <span className="cb-overview-sep" aria-hidden="true" />
                <div className="cb-overview-level">
                    <div className="cb-overview-level-row">
                        <span className="cb-label">{t('account.overview.level')}</span>
                        <span className="cb-tier-chip">
                            <FontAwesomeIcon icon={tierIcon(cashbackTier.id)} />
                            {tierName(cashbackTier)} · {cashbackTier.percent}%
                        </span>
                    </div>
                    <div className="rewards-progress-bar" aria-hidden="true">
                        <span style={{ width: `${Math.round(cashback.level.progress * 100)}%` }} />
                    </div>
                    <span className="cb-overview-next">
                        {cashbackNext && cashback.level.remainingToNext !== null ? (
                            <>
                                {t('account.overview.moreTo', { amount: cashbackMoney(cashback.level.remainingToNext) })} <b>{tierName(cashbackNext)}</b>
                                {' '}{t('account.overview.back', { percent: cashbackNext.percent })}
                            </>
                        ) : (
                            <>{t('account.overview.topLevel', { percent: cashbackTier.percent })}</>
                        )}
                    </span>
                </div>
                <span className="btn btn-outline account-action-btn">{t('common.open')}</span>
            </Link>

            <div className="account-quick-actions">
                <div className="card account-card account-action-card">
                    <div className="account-action-header">
                        <FontAwesomeIcon icon={faBagShopping} />
                        <h3>{t('account.nav.orders')}</h3>
                    </div>
                    <p>{t('account.overview.ordersText')}</p>
                    <div className="account-action-footer">
                        <strong>{ordersSummary}</strong>
                        <Link to="/account/orders" className="btn btn-outline account-action-btn">
                            {t('common.view')}
                        </Link>
                    </div>
                </div>
                <div className="card account-card account-action-card">
                    <div className="account-action-header">
                        <FontAwesomeIcon icon={faKey} />
                        <h3>{t('account.nav.keys')}</h3>
                    </div>
                    <p>{t('account.overview.keysText')}</p>
                    <div className="account-action-footer">
                        <strong>{keysSummary}</strong>
                        <Link to="/account/keys" className="btn btn-outline account-action-btn">
                            {t('common.open')}
                        </Link>
                    </div>
                </div>
                <div className="card account-card account-action-card">
                    <div className="account-action-header">
                        <FontAwesomeIcon icon={faHeart} />
                        <h3>{t('account.nav.saved')}</h3>
                    </div>
                    <p>{t('account.overview.savedText')}</p>
                    <div className="account-action-footer">
                        <strong>{savedSummary}</strong>
                        <Link to="/account/saved" className="btn btn-outline account-action-btn">
                            {t('common.open')}
                        </Link>
                    </div>
                </div>
                <div className="card account-card account-action-card">
                    <div className="account-action-header">
                        <FontAwesomeIcon icon={faCreditCard} />
                        <h3>{t('account.nav.billing')}</h3>
                    </div>
                    <p>{t('account.overview.billingText')}</p>
                    <div className="account-action-footer">
                        <strong>{billingSummary}</strong>
                        <Link to="/account/billing" className="btn btn-outline account-action-btn">
                            {t('common.manage')}
                        </Link>
                    </div>
                </div>
            </div>

            <div className="card account-card">
                <div className="account-section-header">
                    <h3>{t('account.overview.recentOrders')}</h3>
                    <Link to="/account/orders">{t('common.viewAll')}</Link>
                </div>
                <div className="account-table-wrapper">
                    <table className="account-table">
                        <thead>
                        <tr>
                            <th>{t('account.overview.orderId')}</th>
                            <th>{t('account.overview.game')}</th>
                            <th>{t('account.overview.date')}</th>
                            <th>{t('account.overview.amount')}</th>
                            <th>{t('account.overview.invoice')}</th>
                        </tr>
                        </thead>
                        <tbody>
                        {isOrdersLoading && (
                            <tr>
                                <td colSpan={5} className="account-table-state">
                                    {t('account.overview.loadingOrders')}
                                </td>
                            </tr>
                        )}
                        {!isOrdersLoading && ordersError && (
                            <tr>
                                <td colSpan={5} className="account-table-state">
                                    <div className="account-table-state-content">
                                        <span>{ordersError}</span>
                                        <button
                                            type="button"
                                            className="btn btn-outline account-action-btn"
                                            onClick={reloadOrders}
                                        >
                                            {t('common.retry')}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                        {!isOrdersLoading && !ordersError && orders.length === 0 && (
                            <tr>
                                <td colSpan={5} className="account-table-state">
                                    {t('account.overview.noRecentOrders')}
                                </td>
                            </tr>
                        )}
                        {!isOrdersLoading && !ordersError && orders.map((order) => (
                            <tr key={order.internalId}>
                                {/* Классы ячеек нужны узкой раскладке: там таблица становится
                                    списком карточек, и каждая ячейка встаёт на своё место.
                                    По порядку колонок этого делать нельзя — порядок меняется. */}
                                <td className="account-cell-order">{order.orderId}</td>
                                <td className="account-cell-game">
                                    {order.preview.firstTitle || t('account.overview.gamePurchase')}
                                    {order.preview.extraCount > 0 && ` +${order.preview.extraCount}`}
                                </td>
                                <td className="account-cell-date">{formatOrderDate(order.createdAt)}</td>
                                <td className="account-cell-amount">{formatOrderMoney(order.totalAmount, order.currency)}</td>
                                <td className="account-cell-action">
                                    <button
                                        type="button"
                                        className="btn btn-outline account-action-btn"
                                        onClick={() => handleViewOrder(order.orderId)}
                                    >
                                        {t('common.view')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card account-card">
                <div className="account-section-header">
                    <h3>{t('account.overview.recentKeys')}</h3>
                    <Link to="/account/keys">{t('common.viewAll')}</Link>
                </div>
                <div className="account-key-list">
                    {isKeysLoading && (
                        <div className="account-key-item">
                            <div className="account-key-main">
                                <strong>{t('account.overview.loadingKeys')}</strong>
                                <div className="account-key-meta">
                                    <span>{t('account.overview.pleaseWait')}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    {!isKeysLoading && keysError && (
                        <div className="account-key-item">
                            <div className="account-key-main">
                                <strong>{keysError}</strong>
                                <div className="account-key-meta">
                                    <button type="button" className="btn btn-outline account-action-btn" onClick={reloadKeys}>
                                        {t('common.retry')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {!isKeysLoading && !keysError && keys.length === 0 && (
                        <div className="account-key-item">
                            <div>
                                <strong>{t('account.overview.noKeys')}</strong>{' '}
                                <span className="account-key-meta">{t('account.overview.completePurchase')}</span>
                            </div>
                        </div>
                    )}
                    {!isKeysLoading && !keysError && keys.slice(0, 3).map((keyItem, index) => {
                        const title = keyItem.game?.title ?? keyItem.game?.name ?? t('kind.game.unknownProduct');
                        const dateLabel = keyItem.issuedAt
                            ? formatDate(keyItem.issuedAt)
                            : t('common.pending');

                        return (
                            <div key={`${keyItem.key}-${index}`} className="account-key-item">
                                <div className="account-key-main">
                                    <strong>{title}</strong>
                                    <div className="account-key-meta">
                                        <span>{keyItem.keyType ?? t('account.overview.key')}</span>
                                        <span>-</span>
                                        <span>{dateLabel}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-outline account-action-btn"
                                    onClick={() => handleViewKeys(keyItem.game?.id)}
                                >
                                    {t('account.overview.viewKeys')}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {(wishlistError || paymentMethodsError) && (
                <div className="account-overview-alert">
                    <p>
                        {t('account.overview.summariesFailed')}
                    </p>
                    <div className="account-overview-alert-actions">
                        {wishlistError && (
                            <button type="button" className="btn btn-outline account-action-btn" onClick={reloadWishlist}>
                                {t('account.overview.retryWishlist')}
                            </button>
                        )}
                        {paymentMethodsError && (
                            <button type="button" className="btn btn-outline account-action-btn" onClick={reloadPaymentMethods}>
                                {t('account.overview.retryBilling')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="card account-card">
                <div className="account-section-header">
                    <h3>{t('account.overview.recommendations')}</h3>
                </div>
                <RecommendationsSection
                    items={recommendations}
                    isLoading={isRecommendationsLoading}
                    error={recommendationsError}
                    onRetry={reloadRecommendations}
                    emptyMessage={t('cart.recommendedEmpty')}
                    listClassName="account-recommendations"
                    stateClassName="account-recommendations-state"
                    renderSkeleton={(index) => (
                        <div key={`rec-skeleton-${index}`} className="account-recommendation-card is-skeleton" />
                    )}
                    renderItem={(item) => (
                        <div key={item.game.id ?? item.game.title} className="account-recommendation-card" data-hover-trailer-root="">
                            <Cover className="account-recommendation-media" ratio="landscape" sizes="(max-width: 640px) 45vw, 220px" src={item.game.imagePath} title={item.game.title}>
                            <HoverTrailer src={item.game.trailerUrl} poster={item.game.trailerPosterUrl} title={item.game.title} />
                        </Cover>
                            <div className="account-recommendation-body">
                                {/* title: название обрезается двумя строками, полное
                                    остаётся доступным при наведении. */}
                                <strong title={item.game.title}>{item.game.title}</strong>
                                <span className="account-recommendation-price">
                                    {formatMoney(Number(item.game.price), item.game.currency ?? currency)}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary account-recommendation-btn"
                                onClick={() =>
                                    handleAddToCart(
                                        item.game.id ?? '',
                                        item.game.title,
                                        Number(item.game.price),
                                        item.game.imagePath
                                    )
                                }
                                disabled={!item.game.id}
                            >
                                {t('common.addToCart')}
                            </button>
                        </div>
                    )}
                />
            </div>
        </AccountShell>
    );
};

const AccountProfileSummary: React.FC = () => {
    const { profile } = useAccountProfile();
    const displayName = profile?.displayName ?? accountProfile.name;
    const initialsSource = displayName || profile?.email || accountProfile.name;
    const initials = initialsSource
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || accountProfile.initials;

    return (
        <div className="account-avatar account-avatar-lg">
            {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt={i18n.t('account.avatarAlt', { name: displayName })} />
            ) : (
                initials
            )}
        </div>
    );
};

export default AccountOverviewPage;
