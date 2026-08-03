import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCoins, faArrowTrendUp, faArrowRotateLeft, faTag } from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import { getCashbackAccount, type CashbackAccount, type CashbackHistoryType } from '../../../api/cashbackApi';
import './account-rewards-page.css';

const money = (value: number) => `$${value.toFixed(2)}`;

const historyMeta: Record<CashbackHistoryType, { label: string; icon: typeof faCoins; sign: string; className: string }> = {
    Earn: { label: 'Earned', icon: faArrowTrendUp, sign: '+', className: 'is-earn' },
    Redeem: { label: 'Redeemed', icon: faTag, sign: '−', className: 'is-redeem' },
    Reverse: { label: 'Reversed', icon: faArrowRotateLeft, sign: '−', className: 'is-reverse' },
};

const AccountRewardsPage: React.FC = () => {
    const [account, setAccount] = useState<CashbackAccount | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            setAccount(await getCashbackAccount());
        } catch (err) {
            console.error('Failed to load cashback account:', err);
            setError('Unable to load your rewards right now.');
            setAccount(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const disabled = account && !account.enabled;

    return (
        <AccountShell
            title="Rewards"
            sectionLabel="Rewards"
            subtitle="Earn cashback on every order and spend it on future purchases."
        >
            {isLoading && (
                <div className="card account-card rewards-state">Loading your rewards…</div>
            )}

            {!isLoading && error && (
                <div className="card account-card rewards-state">
                    <p>{error}</p>
                    <button type="button" className="btn btn-outline account-action-btn" onClick={load}>Retry</button>
                </div>
            )}

            {!isLoading && !error && disabled && (
                <div className="card account-card rewards-state">
                    <strong>Rewards are currently unavailable.</strong>
                    <p className="muted">The cashback program is turned off. Check back soon.</p>
                </div>
            )}

            {!isLoading && !error && account && !disabled && (
                <>
                    <div className="card account-card rewards-hero">
                        <div className="rewards-balance">
                            <span className="rewards-balance-icon" aria-hidden="true">
                                <FontAwesomeIcon icon={faCoins} />
                            </span>
                            <div>
                                <div className="rewards-balance-label">Cashback balance</div>
                                <div className="rewards-balance-value">{money(account.balance * account.pointToCurrency)}</div>
                                <div className="rewards-balance-sub muted">
                                    {account.balance.toFixed(2)} points · redeem at checkout
                                </div>
                            </div>
                        </div>
                        <div className="rewards-tier">
                            <div className="rewards-tier-badge">{account.currentTier.name}</div>
                            <div className="rewards-tier-rate">{account.currentTier.ratePercent}% back on orders</div>
                        </div>
                    </div>

                    <div className="card account-card">
                        <div className="account-section-header">
                            <h3>Tier progress</h3>
                            <Link to="/rewards">How tiers work</Link>
                        </div>
                        {account.nextTier ? (
                            <>
                                <div className="rewards-progress-track" role="progressbar"
                                    aria-valuenow={Math.round(account.progressPercent)} aria-valuemin={0} aria-valuemax={100}>
                                    <div className="rewards-progress-fill" style={{ width: `${account.progressPercent}%` }} />
                                </div>
                                <p className="rewards-progress-caption muted">
                                    Spend {money(account.nextTier.amountToNext)} more to reach{' '}
                                    <strong>{account.nextTier.name}</strong> ({account.nextTier.ratePercent}% back).
                                </p>
                            </>
                        ) : (
                            <p className="rewards-progress-caption muted">
                                You're at the top tier — enjoy {account.currentTier.ratePercent}% back on every order.
                            </p>
                        )}
                        <div className="rewards-stats">
                            <div className="rewards-stat">
                                <span className="rewards-stat-label">Lifetime earned</span>
                                <span className="rewards-stat-value">{money(account.lifetimeEarned * account.pointToCurrency)}</span>
                            </div>
                            <div className="rewards-stat">
                                <span className="rewards-stat-label">Lifetime spent</span>
                                <span className="rewards-stat-value">{money(account.lifetimeSpent)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="card account-card">
                        <div className="account-section-header">
                            <h3>History</h3>
                        </div>
                        {account.history.length === 0 ? (
                            <div className="rewards-empty">
                                <strong>No cashback yet.</strong>
                                <p className="muted">Your first order will start earning cashback right away.</p>
                                <Link to="/games" className="btn btn-primary account-action-btn">Browse the catalog</Link>
                            </div>
                        ) : (
                            <div className="account-table-wrapper">
                                <table className="account-table rewards-history">
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Details</th>
                                            <th>Date</th>
                                            <th className="rewards-history-amount">Amount</th>
                                            <th className="rewards-history-amount">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {account.history.map((entry) => {
                                            const meta = historyMeta[entry.type] ?? historyMeta.Earn;
                                            return (
                                                <tr key={entry.id}>
                                                    <td>
                                                        <span className={`rewards-badge ${meta.className}`}>
                                                            <FontAwesomeIcon icon={meta.icon} />
                                                            {meta.label}
                                                        </span>
                                                    </td>
                                                    <td>{entry.note ?? '—'}</td>
                                                    <td>{new Date(entry.createdAt).toLocaleDateString()}</td>
                                                    <td className={`rewards-history-amount ${meta.className}`}>
                                                        {meta.sign}{entry.amount.toFixed(2)}
                                                    </td>
                                                    <td className="rewards-history-amount">{entry.balanceAfter.toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </AccountShell>
    );
};

export default AccountRewardsPage;
