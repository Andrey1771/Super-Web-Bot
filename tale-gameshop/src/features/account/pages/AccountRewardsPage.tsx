import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { tierName } from '../../../utils/cashback';
import { formatDate as formatLocalDate } from '../../../i18n/format';
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowRight,
    faCheck,
    faCoins,
    faHourglassHalf,
    faLock,
    faMagnifyingGlass,
    faSackDollar,
    faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import { tierIcon } from '../cashback-icons';
import TileIcon from '../components/TileIcon';
import SafeGameImage from '../../../components/common/SafeGameImage';
import { formatMoney } from '../../../context/site-preferences';
import { CashbackEntry, CashbackEntryStatus, useCashbackStatus } from '../../../hooks/use-cashback-status';
import './account-rewards-page.css';

/**
 * Кэшбэк покупателя в кабинете. Порядок экрана — вопросы в том порядке, в каком их задают:
 * сколько у меня сейчас → почему столько (уровень) → откуда взялось (история).
 *
 * Оформление — как у остальных разделов кабинета (карточки, таблица и фильтры как на
 * «Orders»), а не как у публичной страницы /rewards: там объясняют предложение, здесь
 * человек смотрит свои цифры.
 *
 * Данные — из useCashbackStatus (сервер, в валюте сайта); демо-набор — по ?demo=cashback.
 */

type Filter = 'all' | CashbackEntryStatus;

/** Фильтры — самые частые статусы; сгоревшее, вернувшееся и правки видны во «All». */
// Подписи — в словаре account.rewards.filters.<value>.
const FILTERS: Filter[] = ['all', 'pending', 'available', 'spent', 'reverted'];

/** Даты демо-набора — «2026-09-10», с сервера — полные ISO со временем. */
const toDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);

const formatDate = (iso: string, withYear = true) =>
    formatLocalDate(toDate(iso), {
        month: 'short',
        day: 'numeric',
        ...(withYear ? { year: 'numeric' } : {}),
    });

const monthKey = (iso: string) => {
    const date = toDate(iso);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (iso: string) => formatLocalDate(toDate(iso), { month: 'long', year: 'numeric' });

const statusLabel = (entry: CashbackEntry) => {
    switch (entry.status) {
        case 'pending':
            return entry.unlocksAt ? i18n.t('account.rewards.statusPendingDate', { date: formatDate(entry.unlocksAt, false) }) : i18n.t('account.rewards.statusPending');
        case 'available':
            return i18n.t('account.rewards.statusAvailable');
        case 'spent':
            return entry.type === 'spend' ? i18n.t('account.rewards.statusUsedCheckout') : i18n.t('account.rewards.statusUsed');
        case 'expired':
            return i18n.t('account.rewards.statusExpired');
        case 'returned':
            return i18n.t('account.rewards.statusBackRefund');
        case 'adjusted':
            return i18n.t('account.rewards.statusAdjustment');
        default:
            return entry.type === 'reversal' ? i18n.t('account.rewards.statusTakenBack') : i18n.t('account.rewards.statusRefundedOrder');
    }
};

const AccountRewardsPage: React.FC = () => {
    const { t } = useTranslation();
    const cashback = useCashbackStatus();
    // Суммы приходят в валюте ответа: для валюты без курса сервер отдаёт доллары, и подписывать
    // их валютой сайта было бы неправдой.
    const currency = cashback.currency;
    const money = (value: number) => formatMoney(value, currency);
    const { level } = cashback;
    const tiers = level.tiers;
    const tierIndex = Math.max(0, tiers.findIndex((item) => item.id === level.tierId));
    const tier = tiers[tierIndex];
    const next = level.nextTierId ? tiers.find((item) => item.id === level.nextTierId) ?? null : null;
    const remaining = level.remainingToNext;
    const ratio = level.progress;

    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');

    const counts = useMemo(() => {
        const result: Record<string, number> = { all: 0 };
        cashback.history.forEach((entry) => {
            result.all += 1;
            result[entry.status] = (result[entry.status] ?? 0) + 1;
        });
        return result;
    }, [cashback.history]);

    // Записи по месяцам: так историю читают — «что было в августе», а не построчно.
    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const visible = cashback.history.filter(
            (entry) =>
                (filter === 'all' || entry.status === filter) &&
                (!needle ||
                    entry.gameTitle.toLowerCase().includes(needle) ||
                    entry.orderNumber.toLowerCase().includes(needle))
        );
        const byMonth = new Map<string, CashbackEntry[]>();
        visible.forEach((entry) => {
            const key = monthKey(entry.date);
            byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
        });
        return Array.from(byMonth.entries());
    }, [cashback.history, filter, query]);

    const hasHistory = cashback.history.length > 0;

    return (
        <AccountShell
            title={t('account.rewards.title')}
            sectionLabel={t('account.rewards.title')}
            subtitle={t('account.rewards.subtitle')}
        >
            {cashback.isDemo && (
                <p className="cb-demo-note" role="note">
                    Demo data — turned on with <code>?demo=cashback</code>, off with <code>?demo=off</code>.
                </p>
            )}

            {/* Балансы. Доступный — тот, за которым сюда пришли: он один выделен. */}
            <div className="cb-balances">
                {/* Пока тратить нечего, кнопки «Spend» нет: при нуле она зовёт потратить ничего
                    и дублирует «Browse games» из пустой истории. Зелёный — тоже только у денег. */}
                <div className={`card account-card cb-balance is-primary${cashback.available > 0 ? ' has-money' : ''}`}>
                    <div className="cb-balance-top">
                        <span className="cb-icon" aria-hidden="true"><FontAwesomeIcon icon={faCoins} /></span>
                        <span className="cb-label">{t('account.rewards.available')}</span>
                    </div>
                    <strong className="cb-balance-value">{money(cashback.available)}</strong>
                    <span className="cb-balance-hint">
                        {cashback.available > 0 ? t('account.rewards.readyToSpend') : t('account.rewards.landsHere')}
                    </span>
                    {cashback.available > 0 && (
                        <Link to="/games" className="btn btn-primary account-action-btn cb-balance-btn">
                            {t('account.rewards.spendOnGame')}
                            <FontAwesomeIcon icon={faArrowRight} />
                        </Link>
                    )}
                </div>

                <div className="card account-card cb-balance">
                    <div className="cb-balance-top">
                        <span className="cb-icon" aria-hidden="true"><FontAwesomeIcon icon={faHourglassHalf} /></span>
                        <span className="cb-label">{t('account.rewards.pending')}</span>
                    </div>
                    <strong className="cb-balance-value">{money(cashback.pending)}</strong>
                    <span className="cb-balance-hint">
                        {cashback.nextUnlockAt ? (
                            <>{t('account.rewards.unlocksOn')} <b>{formatDate(cashback.nextUnlockAt, false)}</b>{t('account.rewards.afterRefundWindow')}</>
                        ) : (
                            t('account.rewards.waitsHere')
                        )}
                    </span>
                </div>

                <div className="card account-card cb-balance">
                    <div className="cb-balance-top">
                        <span className="cb-icon" aria-hidden="true"><FontAwesomeIcon icon={faSackDollar} /></span>
                        <span className="cb-label">{t('account.rewards.earnedAllTime')}</span>
                    </div>
                    <strong className="cb-balance-value">{money(cashback.earnedAllTime)}</strong>
                    <span className="cb-balance-hint">
                        {cashback.usedAllTime > 0 ? t('account.rewards.alreadyUsed', { amount: money(cashback.usedAllTime) }) : t('account.rewards.nothingUsed')}
                    </span>
                </div>
            </div>

            <div className="card account-card">
                <div className="account-section-header cb-section-header">
                    <div>
                        <h3>{t('account.rewards.yourLevel')}</h3>
                        <p className="muted">{t('account.rewards.basedOnSpend')}</p>
                    </div>
                    <Link to="/rewards" className="link-arrow">
                        {t('account.rewards.howItWorks')}
                        <span className="link-arrow__icon" aria-hidden="true">→</span>
                    </Link>
                </div>

                {/* Верхний уровень — награда, а не строка статистики: идти некуда, полосе и сумме трат тут нечего
                    показывать. Оформление — язык страницы /rewards: тёмная фиолетовая сцена, фирменная текстура,
                    пятна света и медальон. Ниже верхнего уровня остаётся обычная карточка с прогрессом к цели. */}
                {next ? (
                    <div className="cb-level">
                        <div className="cb-level-now">
                            <span className="cb-level-badge" aria-hidden="true">
                                <TileIcon icon={tierIcon(tier.id)} size={24} />
                            </span>
                            <div>
                                <span className="cb-label">{t('account.rewards.current')}</span>
                                <strong>{tierName(tier)}</strong>
                                <span className="cb-level-percent">{t('account.rewards.backOnEvery', { percent: tier.percent })}</span>
                            </div>
                        </div>

                        {/* Полоса — путь от порога ТЕКУЩЕГО уровня до следующего, а не от нуля: иначе только что
                            перешедший на Veteran видел бы «20% пути», пройдя ноль нового. */}
                        <div className="cb-level-progress">
                            <div className="cb-level-row">
                                <span><b>{money(cashback.totalSpent)}</b> {t('account.rewards.spent')}</span>
                                {next.spendThreshold !== null && (
                                    <span className="muted">{t('account.rewards.nextAt', { name: tierName(next), amount: money(next.spendThreshold) })}</span>
                                )}
                            </div>
                            <div
                                className="rewards-progress-bar cb-bar"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(ratio * 100)}
                                aria-label={t('account.rewards.progressTo', { name: tierName(next) })}
                            >
                                <span style={{ width: `${Math.round(ratio * 100)}%` }} />
                            </div>
                            {remaining !== null && (
                                <span className="cb-level-text">
                                    {t('account.rewards.spendMore')} <b>{money(remaining)}</b> {t('account.rewards.moreToReach')} <b>{tierName(next)}</b> {t('account.rewards.andBack', { percent: next.percent })}
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="cb-top">
                        <div className="cb-top-text">
                            <span className="cb-top-kicker">
                                <FontAwesomeIcon icon={faWandMagicSparkles} aria-hidden="true" />
                                {t('account.rewards.topReached')}
                            </span>
                            <strong className="cb-top-title">{t('account.rewards.highestTier', { name: tierName(tier) })}</strong>
                            <p className="cb-top-sub">
                                {t('account.rewards.topText')}
                            </p>
                            <span className="cb-top-chip">
                                <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                                {t('account.rewards.neverDown')}
                            </span>
                        </div>

                        {/* Процент — награда: жетон-шестигранник со своей шириной и табличными цифрами. Не сжимается
                            вместе с текстом и не переносится, поэтому «33%» остаётся читаемым на любой ширине. */}
                        <div className="cb-top-award">
                            <span className="cb-top-token" aria-hidden="true">
                                <i className="cb-top-token-face" />
                                <span className="cb-top-num">{tier.percent}<sup>%</sup></span>
                            </span>
                            {/* Жетон — картинка, поэтому число в нём скрыто от скринридера: вслух читается эта строка. */}
                            <span className="cb-top-cap">
                                <span className="visually-hidden">{tier.percent}% </span>
                                {t('account.rewards.backOnEveryShort')}
                            </span>
                        </div>
                    </div>
                )}

                <ol className="cb-tiers">
                    {tiers.map((item, index) => {
                        const state = index < tierIndex ? 'is-done' : index === tierIndex ? 'is-current' : 'is-locked';
                        const icon = state === 'is-done' ? faCheck : state === 'is-current' ? tierIcon(item.id) : faLock;
                        return (
                            <li key={item.id} className={`cb-tier ${state}`} aria-current={index === tierIndex ? 'step' : undefined}>
                                <span className="cb-tier-icon" aria-hidden="true"><TileIcon icon={icon} size={14} /></span>
                                <div>
                                    <strong>{tierName(item)}</strong>
                                    <span className="muted">
                                        {item.spendThreshold === null ? t('account.rewards.fromStart') : t('account.rewards.from', { amount: money(item.spendThreshold) })}
                                    </span>
                                </div>
                                <span className="cb-tier-percent">{item.percent}%</span>
                                {index === tierIndex && <span className="cb-tier-flag">{t('account.rewards.youAreHere')}</span>}
                            </li>
                        );
                    })}
                </ol>
            </div>

            <div className="card account-card">
                <div className="account-section-header cb-section-header">
                    <div>
                        <h3>{t('account.rewards.history')}</h3>
                        <p className="muted">{t('account.rewards.historyText')}</p>
                    </div>
                </div>

                {!hasHistory ? (
                    <div className="rewards-empty">
                        <span className="rewards-empty-icon" aria-hidden="true">
                            <FontAwesomeIcon icon={faCoins} />
                        </span>
                        <h4>{t('account.rewards.nothingYet')}</h4>
                        <p className="muted">{t('account.rewards.firstOrder')}</p>
                        <Link to="/games" className="btn btn-primary">{t('common.browseGames')}</Link>
                    </div>
                ) : (
                    <>
                        <div className="cb-toolbar">
                            <label className="orders-search cb-search">
                                <FontAwesomeIcon icon={faMagnifyingGlass} className="orders-search-icon" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder={t('account.rewards.searchPlaceholder')}
                                    aria-label={t('account.rewards.searchAria')}
                                />
                            </label>
                            <div className="orders-status" role="tablist" aria-label={t('account.rewards.statusFilter')}>
                                {FILTERS.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="tab"
                                        aria-selected={filter === value}
                                        className={`btn btn-outline orders-status-btn${filter === value ? ' is-active' : ''}`}
                                        onClick={() => setFilter(value)}
                                    >
                                        {t(`account.rewards.filters.${value}`)}
                                        <span className="cb-count">{counts[value]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="account-table-wrapper">
                            <table className="account-table cb-table">
                                <thead>
                                    <tr>
                                        <th>{t('account.rewards.game')}</th>
                                        <th>{t('account.rewards.date')}</th>
                                        <th>{t('account.rewards.orderTotal')}</th>
                                        <th>{t('account.rewards.rate')}</th>
                                        <th>{t('account.rewards.cashback')}</th>
                                        <th>{t('account.rewards.status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groups.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="account-table-state">
                                                {t('account.rewards.noEntries')}
                                            </td>
                                        </tr>
                                    )}
                                    {groups.map(([month, entries]) => (
                                        <React.Fragment key={month}>
                                            <tr className="cb-month">
                                                <td colSpan={6}>{monthLabel(entries[0].date)}</td>
                                            </tr>
                                            {entries.map((entry) => (
                                                <tr key={entry.id}>
                                                    <td className="cb-cell-game">
                                                        <div className="cb-game">
                                                            <SafeGameImage
                                                                src={entry.imagePath}
                                                                gameTitle={entry.gameTitle}
                                                                className="cb-cover"
                                                                loading="lazy"
                                                            />
                                                            <div>
                                                                <strong>{entry.gameTitle || (entry.type === 'adjust' ? t('account.rewards.balanceAdjustment') : t('account.rewards.order'))}</strong>
                                                                <span className="muted">
                                                                    {entry.orderNumber ? t('common.order', { id: entry.orderNumber }) : entry.note ?? ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="cb-cell-date">{formatDate(entry.date)}</td>
                                                    <td className="cb-cell-total">
                                                        {entry.orderTotal === null ? '—' : formatMoney(entry.orderTotal, entry.orderCurrency ?? currency)}
                                                    </td>
                                                    <td className="cb-cell-rate muted">
                                                        {entry.percent === null ? '—' : `${entry.percent}%`}
                                                    </td>
                                                    <td className={`cb-cell-amount cb-amount is-${entry.status}`}>
                                                        {entry.amount < 0 ? '−' : '+'}
                                                        {money(Math.abs(entry.amount))}
                                                    </td>
                                                    <td className="cb-cell-status">
                                                        <span className={`cb-status is-${entry.status}`}>{statusLabel(entry)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </AccountShell>
    );
};

export default AccountRewardsPage;
