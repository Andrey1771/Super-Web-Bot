import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { serverErrorText } from '../../../utils/api-error';
import { formatDate as formatLocalDate } from '../../../i18n/format';
import { Link, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faMagnifyingGlass,
  faStar,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import AccountRecommendationCard from '../components/AccountRecommendationCard';
import { useRecommendations } from '../../../hooks/use-recommendations';
import { useOrders } from '../../../hooks/use-orders';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import { fetchAccountOrderDetails, resendAccountOrderKeys, revealAccountOrderKeys } from '../../../api/accountApi';
import ConfirmPasswordModal from '../components/ConfirmPasswordModal';
import type { AccountOrderDetails, AccountOrderDetailItem, AccountOrderListItem } from '../../../types/account-orders';
import Cover from '../../../components/common/Cover';
import { useSitePreferences } from '../../../context/site-preferences';
import { formatMoney, formatOrderMoney } from '../../../utils/format-money';
import { taxLabel } from '../../../utils/tax-label';
import { buildPageRange } from '../../../utils/page-range';
import './account-orders-page.css';

const PAGE_SIZE = 10;

type StatusFilter = 'all' | 'completed' | 'refunded' | 'pending' | 'failed';
type SortOption = 'newest' | 'oldest' | 'total_desc' | 'total_asc';

type OrderDetailItem = AccountOrderDetails['items'][number];

// Суммы заказа форматируются в валюте самого заказа — она зафиксирована при оплате.
// Битую дату общий форматтер возвращает как есть — отдельная проверка здесь не нужна.
const formatDate = (value: string) => formatLocalDate(value, { month: 'long', day: 'numeric', year: 'numeric' });

const toStatusMeta = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized === 'DELIVERED') {
    return { label: i18n.t('account.orders.status.completed'), className: 'status-completed' };
  }
  if (normalized === 'REFUNDED') {
    return { label: i18n.t('account.orders.status.refunded'), className: 'status-refunded' };
  }
  if (normalized === 'FAILED' || normalized === 'CANCELLED') {
    return { label: i18n.t('account.orders.status.failed'), className: 'status-failed' };
  }
  if (normalized === 'PENDING') {
    return { label: i18n.t('account.orders.status.pending'), className: 'status-processing' };
  }
  if (normalized === 'AWAITING_KEYS' || normalized === 'PENDING_KEYS' || normalized === 'PARTIAL') {
    // Оплачено, но ключей на складе пока не хватило — довыдадим при пополнении пула.
    return { label: i18n.t('account.orders.status.awaitingKeys'), className: 'status-processing' };
  }

  return { label: i18n.t('account.orders.status.processing'), className: 'status-processing' };
};

/** Ключ целиком с кнопкой «Copy» — как на странице Keys. */
const KeyPill: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy key:', error);
    }
  };
  return (
    <span className="order-line-key">
      <code>{value}</code>
      <button type="button" className="order-line-key-copy" onClick={copy} aria-label={i18n.t('account.orders.copyKey', { key: value })}>
        {copied ? i18n.t('common.copied') : i18n.t('common.copy')}
      </button>
    </span>
  );
};

// Экспортируется ради теста: вся логика показа кнопки «оценить» живёт здесь, а поднимать
// ради неё всю страницу заказов с её хуками и запросами — дороже, чем она стоит.
export const OrderItemRow: React.FC<{ item: AccountOrderDetailItem; revealedKeys?: string[] | null }> = ({ item, revealedKeys }) => {
  const { t } = useTranslation();
  // Куда вести решает сервер по каталогу сейчас: игры больше нет — ссылки нет, строка остаётся
  // в истории с пометкой. Ссылки — обложка и название, как в корзине и на кассе; вся строка
  // ссылкой быть не может: внутри есть кнопка «Copy».
  const target = item.available !== false && item.slug ? `/games/${item.slug}` : null;

  // Показывать кнопку решает сервер: он же принимает отзыв и знает про оплату, выдачу
  // и уже написанное. Кабинету остаётся выбрать подпись.
  const canReview = Boolean(item.canReview && target);

  return (
    <div className="order-line">
    <div className="order-line-item">
      {target ? (
        <Link className="order-line-cover-link" to={target} aria-label={t('account.orders.openItem', { title: item.title })}>
          <Cover className="order-line-cover" ratio="square" sizes="56px" src={item.coverUrl} title={item.title} />
        </Link>
      ) : (
        <Cover className="order-line-cover" ratio="square" sizes="56px" src={item.coverUrl} title={item.title} />
      )}

      <div className="order-line-main">
        <strong className="order-line-title">
          {target ? <Link className="order-line-title-link" to={target}>{item.title}</Link> : item.title}
        </strong>
        {(item.platform || item.region || item.available === false) && (
          <div className="order-line-secondary-meta">
            {item.platform ? <span>{item.platform}</span> : null}
            {item.region ? <span>{item.region}</span> : null}
            {item.available === false ? <span className="order-line-unavailable">{t('account.orders.noLongerSold')}</span> : null}
          </div>
        )}
        {revealedKeys && revealedKeys.length > 0 ? (
          <div className="order-line-keys order-line-keys--revealed">
            <strong>{t('account.orders.keys')}</strong>
            {revealedKeys.map((key) => <KeyPill key={key} value={key} />)}
          </div>
        ) : item.keys.length > 0 ? (
          <div className="order-line-keys">
            <strong>{t('account.orders.keys')}</strong>
            {item.keys.map((key) => <span key={key}>{key}</span>)}
          </div>
        ) : (
          <div className="order-line-keys order-line-keys--pending">
            <span>{t('account.orders.awaitingDelivery')}</span>
          </div>
        )}
      </div>

      <div className="order-line-pricing">
        <span>{t('account.orders.qty', { count: item.quantity })}</span>
        <span>{t('account.orders.each', { price: formatOrderMoney(item.finalUnitPrice, item.currency) })}</span>
        <strong>{formatOrderMoney(item.lineTotal, item.currency)}</strong>
      </div>
    </div>

    {canReview && (
      <div className="order-line-review">
        <Link className="order-line-review-link" to={`${target}?tab=reviews`}>
          <FontAwesomeIcon icon={item.hasReview ? faPenToSquare : faStar} />
          <span>{item.hasReview ? t('account.orders.editReview') : t('account.orders.leaveReview')}</span>
        </Link>
        {!item.hasReview && (
          <span className="order-line-review-hint">{t('account.orders.reviewHint')}</span>
        )}
      </div>
    )}
    </div>
  );
};

/** Что с кэшбэком за заказ сейчас — одной короткой строкой под суммой. */
const earnedStatusLabel = (cashback: NonNullable<AccountOrderDetails['cashback']>) => {
  const percent = cashback.percent ? `${cashback.percent}% · ` : '';
  switch (cashback.earnedStatus) {
    case 'available':
      return `${percent}${i18n.t('account.orders.cbOnBalance')}`;
    case 'spent':
      return `${percent}${i18n.t('account.orders.cbUsed')}`;
    case 'expired':
      return `${percent}${i18n.t('account.orders.cbExpired')}`;
    case 'reverted':
      return i18n.t('account.orders.cbReverted');
    default:
      return cashback.unlocksAt
        ? `${percent}${i18n.t('account.orders.cbUnlocks', { date: formatLocalDate(cashback.unlocksAt, { month: 'short', day: 'numeric' }) })}`
        : `${percent}${i18n.t('account.orders.cbPending')}`;
  }
};

const OrderSummaryCard: React.FC<{ details: AccountOrderDetails }> = ({ details }) => {
  const { t } = useTranslation();
  return (
  <aside className="order-summary-card">
    <h4>{t('account.orders.summary')}</h4>
    <div className="order-summary-row">
      <span>{t('common.subtotal')}</span>
      <span>{formatOrderMoney(details.totals.subtotal, details.currency)}</span>
    </div>
    <div className="order-summary-row">
      <span>{t('common.discount')}</span>
      <span>-{formatOrderMoney(details.totals.discountTotal, details.currency)}</span>
    </div>
    {/* Цены с налогом: строка показывает, сколько его внутри итога, и в сумму не прибавляется. */}
    {details.totals.taxTotal > 0 ? (
      <div className="order-summary-row">
        <span>{t('checkout.inclTax', { tax: taxLabel(details.totals.taxType, details.totals.taxRatePercent) })}</span>
        <span>{formatOrderMoney(details.totals.taxTotal, details.currency)}</span>
      </div>
    ) : (
      <div className="order-summary-row">
        <span>{t('common.tax')}</span>
        <span>{t('common.includedInPrice')}</span>
      </div>
    )}
    {/* Оплаченное кэшбэком — отдельной строкой: Total — это деньги с карты, и без этой строки
        Subtotal − Discount не сходился бы с итогом. */}
    {details.cashback && details.cashback.applied > 0 && (
      <div className="order-summary-row order-summary-cashback-paid">
        <span>{t('account.orders.paidWithCashback')}</span>
        <span>-{formatOrderMoney(details.cashback.applied, details.currency)}</span>
      </div>
    )}
    <div className="order-summary-divider" />
    <div className="order-summary-row order-summary-total">
      <span>{t('common.total')}</span>
      <span>{formatOrderMoney(details.totals.total, details.currency)}</span>
    </div>
    {/* Чем платили — словами («Visa •••• 4242»): через полгода этого никто не помнит, а при возврате это первый вопрос. */}
    {details.paymentMethod && (
      <div className="order-summary-row order-summary-paid-with">
        <span>{t('account.orders.paidWith')}</span>
        <span>{details.paymentMethod}</span>
      </div>
    )}
    {details.cashback?.earned != null && details.cashback.earned > 0 && (
      <div className={`order-summary-cashback is-${details.cashback.earnedStatus ?? 'pending'}`}>
        <span>
          {t('account.orders.cashbackEarned')}
          <small>{earnedStatusLabel(details.cashback)}</small>
        </span>
        <strong>+{formatOrderMoney(details.cashback.earned, details.currency)}</strong>
      </div>
    )}
  </aside>
  );
};

/**
 * Ключи не должны пропасть вместе с письмом: «Show keys» показывает их целиком прямо в заказе,
 * «Resend to my email» шлёт письмо повторно на адрес аккаунта. Экспорт — ради теста.
 */
export const OrderDetails: React.FC<{ details: AccountOrderDetails }> = ({ details }) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState<Record<string, string[]> | null>(null);
  // Показ ключей — только после повторного пароля: одна угнанная сессия ключи не получит.
  const [askingPassword, setAskingPassword] = useState(false);
  const [resend, setResend] = useState<{ state: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ state: 'idle' });
  const hasKeys = details.items.some((item) => item.keys.length > 0);

  const toggleKeys = () => {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setAskingPassword(true);
  };

  // Ошибку (неверный пароль, пауза после пяти попыток) показывает само окно и остаётся открытым.
  const revealWithPassword = async (password: string) => {
    const response = await revealAccountOrderKeys(details.internalId, password);
    setRevealed(Object.fromEntries(response.items.map((line) => [line.itemId, line.keys])));
    setAskingPassword(false);
  };

  const handleResend = async () => {
    setResend({ state: 'sending' });
    try {
      const response = await resendAccountOrderKeys(details.internalId);
      setResend({ state: 'sent', message: t('account.orders.sentKeys', { count: response.count, email: response.sentTo }) });
    } catch (error: any) {
      console.error('Failed to resend order keys:', error);
      setResend({ state: 'error', message: serverErrorText(error, t('account.orders.resendFailed')) });
    }
  };

  return (
    <div className="order-details-layout">
      <section className="order-line-items" aria-label={t('account.orders.orderItems')}>
        {/* Полоса действий с ключами над списком: подпись слева, кнопки справа, ответ сервера строкой под ними. */}
        {hasKeys && (
          <div className="order-keys-actions">
            <div className="order-keys-row">
              <span className="order-keys-label">{t('account.orders.yourKeys')}</span>
              <div className="order-keys-buttons">
                <button type="button" className="btn btn-outline order-keys-btn" onClick={toggleKeys}>
                  {revealed ? t('account.orders.hideKeys') : t('account.orders.showKeys')}
                </button>
                <button type="button" className="btn btn-outline order-keys-btn" onClick={handleResend} disabled={resend.state === 'sending' || resend.state === 'sent'}>
                  {resend.state === 'sending' ? t('common.sending') : t('account.orders.resendEmail')}
                </button>
              </div>
            </div>
            {resend.message && (
              <span className={`order-keys-note${resend.state === 'error' ? ' order-keys-note--error' : ''}`} role="status">{resend.message}</span>
            )}
          </div>
        )}
        {details.items.map((item) => (
          <OrderItemRow key={item.itemId} item={item} revealedKeys={revealed?.[item.itemId] ?? null} />
        ))}
        {askingPassword && <ConfirmPasswordModal onConfirm={revealWithPassword} onClose={() => setAskingPassword(false)} />}
      </section>
      <OrderSummaryCard details={details} />
    </div>
  );
};

const OrderCard: React.FC<{ order: AccountOrderListItem }> = ({ order }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<AccountOrderDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const statusMeta = toStatusMeta(order.status);
  const panelId = `order-details-${order.internalId}`;

  const previewTitle = order.preview.firstTitle || t('account.overview.gamePurchase');
  const previewText = order.itemsCount <= 1
    ? t('account.orders.preview', { count: order.itemsCount || 0, title: previewTitle })
    : `${t('account.orders.preview', { count: order.itemsCount, title: previewTitle })} +${order.preview.extraCount}`;

  const handleToggle = async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);

    if (!nextExpanded || details || loadingDetails) {
      return;
    }

    setLoadingDetails(true);
    setDetailsError(null);
    try {
      const response = await fetchAccountOrderDetails(order.internalId);
      setDetails(response);
    } catch (error) {
      console.error('Failed to load order details:', error);
      setDetailsError(t('account.orders.detailsFailed'));
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="card order-card">
      {/* Вся карточка — одна кнопка: раскрывается кликом по любому месту, включая обложку
          и номер заказа. Отдельная кнопка «View details» была единственным способом открыть
          заказ, хотя нажать хочется на сам заказ. Тег button берёт на себя и клавиатуру. */}
      <button
        type="button"
        className="order-card-summary"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <div className="order-card-header">
          <span className="order-date">{formatDate(order.createdAt)}</span>
          <span className="order-amount">{formatOrderMoney(order.totalAmount, order.currency)}</span>
        </div>
        <div className="order-card-body">
          {/* Обложка первой игры заказа; у снятой с продажи или без картинки —
              общая заглушка каталога, как в корзине и рекомендациях. */}
          <Cover className="order-cover" ratio="square" sizes="64px" src={order.preview.firstCoverUrl} title={order.preview.firstTitle} />
          <div className="order-details">
            {/* Стрелка стоит у номера заказа, а не в углу карточки: раскрывается именно
                заказ, и значок должен быть при том, что он раскрывает. */}
            <div className="order-title-row">
              <strong>{t('common.order', { id: order.orderId })}</strong>
              <FontAwesomeIcon
                icon={faChevronDown}
                className={`order-chevron${expanded ? ' is-open' : ''}`}
                aria-hidden="true"
              />
            </div>
            <div className="order-items">
              <span>{previewText}</span>
            </div>
          </div>
          <div className="order-actions">
            <span className={`badge order-status ${statusMeta.className}`}>{statusMeta.label}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="order-details-panel" id={panelId}>
          {loadingDetails && <div className="order-details-state">{t('account.orders.loadingDetails')}</div>}
          {!loadingDetails && detailsError && <div className="order-details-state order-details-error">{detailsError}</div>}
          {!loadingDetails && !detailsError && details?.legacyDetailsUnavailable && (
            <div className="order-details-state">{t('account.orders.legacy')}</div>
          )}
          {!loadingDetails && !detailsError && details && !details.legacyDetailsUnavailable && (
            <OrderDetails details={details} />
          )}
        </div>
      )}
    </div>
  );
};

const AccountOrdersPage: React.FC = () => {
  const { t } = useTranslation();
  const { currency } = useSitePreferences();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortOption>('newest');
  const [searchParams] = useSearchParams();
  // ?q= в адресе — так «View» из обзора открывает конкретный заказ: список сразу
  // отфильтрован по его номеру. Значение читается один раз, при открытии страницы;
  // дальше поле принадлежит человеку, и переписывать его из адреса нельзя.
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') ?? '');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const {
    items: recommendations,
    isLoading: isRecommendationsLoading,
    error: recommendationsError,
    reload: reloadRecommendations,
  } = useRecommendations(6);

  const {
    items: orders,
    totalCount,
    totalPages,
    isLoading: isOrdersLoading,
    error: ordersError,
    reload: reloadOrders,
  } = useOrders({
    page,
    pageSize: PAGE_SIZE,
    status,
    q: debouncedSearch,
    sort,
  });

  const ordersTitle = isOrdersLoading ? t('account.orders.title') : t('account.orders.titleCount', { count: totalCount });
  const from = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = totalCount === 0 ? 0 : Math.min(page * PAGE_SIZE, totalCount);
  const ordersSubtitle = isOrdersLoading
    ? t('account.orders.loading')
    : ordersError
      ? t('account.orders.loadFailed')
      : totalCount === 0
        ? t('account.orders.none')
        : t('common.showingRange', { from, to, total: totalCount });

  const pages = useMemo(() => buildPageRange(page, totalPages), [page, totalPages]);

  const applyStatus = (nextStatus: StatusFilter) => {
    setStatus(nextStatus);
    setPage(1);
  };

  const applySort = (nextSort: SortOption) => {
    setSort(nextSort);
    setPage(1);
  };

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };

  // Тулбар (поиск/сортировка/фильтры) не показываем на пустом списке — фильтровать нечего.
  const showToolbar = totalCount > 0 || searchInput.trim() !== '' || status !== 'all';

  return (
    <AccountShell
      title={ordersTitle}
      sectionLabel={t('account.orders.title')}
      subtitle={ordersSubtitle}
    >
      {showToolbar && (
      <div className="card orders-toolbar">
        <div className="orders-toolbar-top">
          <div className="orders-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="orders-search-icon" />
            <input
              type="search"
              placeholder={t('account.orders.searchPlaceholder')}
              value={searchInput}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        </div>
        <div className="orders-toolbar-row">
          <div className="orders-sort">
            <span>{t('common.sortLabel')}</span>
            <select className="orders-select" value={sort} onChange={(event) => applySort(event.target.value as SortOption)}>
              <option value="newest">{t('common.newest')}</option>
              <option value="oldest">{t('common.oldest')}</option>
              <option value="total_desc">{t('account.orders.highestPrice')}</option>
              <option value="total_asc">{t('account.orders.lowestPrice')}</option>
            </select>
          </div>
          <div className="orders-status" role="tablist" aria-label={t('account.orders.statusFilter')}>
            {([
              ['all', t('common.all')],
              ['completed', t('account.orders.status.completed')],
              ['refunded', t('account.orders.status.refunded')],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                className={`btn btn-outline orders-status-btn ${status === value ? 'is-active' : ''}`}
                onClick={() => applyStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="orders-toolbar-footer">
          <span>{ordersSubtitle}</span>
        </div>
      </div>
      )}

      <div className="orders-list">
        {isOrdersLoading && Array.from({ length: 3 }, (_, index) => (
          <div key={`orders-skeleton-${index}`} className="card orders-state orders-state-skeleton">{t('account.orders.loadingOne')}</div>
        ))}
        {!isOrdersLoading && ordersError && (
          <div className="card orders-state orders-state-error">
            <span>{ordersError}</span>
            <button type="button" className="btn btn-outline" onClick={reloadOrders}>
              {t('common.tryAgain')}
            </button>
          </div>
        )}
        {!isOrdersLoading && !ordersError && orders.length === 0 && (
          <div className="card orders-state">{t('account.orders.noneDot')}</div>
        )}
        {!isOrdersLoading && !ordersError && orders.map((order) => <OrderCard key={order.internalId} order={order} />)}
      </div>

      {totalPages > 1 && (
        <div className="orders-pagination">
          <div className="orders-pagination-controls">
            <button
              type="button"
              className="btn btn-outline orders-page-btn"
              aria-label={t('common.previousPage')}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={isOrdersLoading || page <= 1}
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            {pages.map((item, index) => (
              item === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="orders-page-ellipsis">…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`btn btn-outline orders-page-btn ${item === page ? 'is-active' : ''}`}
                  onClick={() => setPage(item as number)}
                  disabled={isOrdersLoading}
                >
                  {item}
                </button>
              )
            ))}
            <button
              type="button"
              className="btn btn-outline orders-page-btn"
              aria-label={t('common.nextPage')}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={isOrdersLoading || page >= totalPages}
            >
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
          <span className="orders-pagination-note">{ordersSubtitle}</span>
        </div>
      )}

      <section className="orders-recommendations">
        <div className="orders-recommendations-header">
          <h3>{t('account.overview.recommendations')}</h3>
        </div>
        <RecommendationsSection
          items={recommendations}
          isLoading={isRecommendationsLoading}
          error={recommendationsError}
          onRetry={reloadRecommendations}
          emptyMessage={t('cart.recommendedEmpty')}
          listClassName="orders-recommendations-list"
          stateClassName="orders-recommendations-state"
          renderSkeleton={(index) => (
            <div key={`rec-skeleton-${index}`} className="card orders-recommendation-card is-skeleton" />
          )}
          renderItem={(item) => <AccountRecommendationCard key={item.game.id ?? item.game.title} game={item.game} />}
        />
      </section>
    </AccountShell>
  );
};

export default AccountOrdersPage;
