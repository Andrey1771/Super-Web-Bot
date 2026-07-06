import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../components/ui/ToastProvider';
import {
    approveRecovery,
    executeRecovery,
    getRecoveryDetail,
    listRecoveryRequests,
    rejectRecovery,
    updateRecoveryChecklist,
    RecoveryDetail,
    RecoveryStatus,
    RecoverySummary
} from '../../api/adminRecoveryApi';

// Рабочее место оператора восстановления доступа: слева — очередь заявок,
// справа — карточка сверки (заявленное против наших данных), чек-лист и действия.

const statusColors: Record<RecoveryStatus, { bg: string; fg: string }> = {
    Pending: { bg: '#fef3c7', fg: '#92400e' },
    Approved: { bg: '#dbeafe', fg: '#1e40af' },
    Executed: { bg: '#dcfce7', fg: '#166534' },
    Rejected: { bg: '#fee2e2', fg: '#991b1b' },
    Cancelled: { bg: '#e5e7eb', fg: '#374151' }
};

const StatusPill: React.FC<{ status: RecoveryStatus }> = ({ status }) => {
    const colors = statusColors[status] ?? statusColors.Pending;
    return (
        <span style={{ background: colors.bg, color: colors.fg, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {status}
        </span>
    );
};

const formatDate = (value?: string | null) => {
    if (!value) {
        return '—';
    }
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString();
};

const sectionStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10
};

const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };

const FactRow: React.FC<{ label: string; value?: React.ReactNode; highlight?: boolean }> = ({ label, value, highlight }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, lineHeight: 1.5 }}>
        <span style={{ color: '#6b7280', flexShrink: 0 }}>{label}</span>
        <span style={{ textAlign: 'right', fontWeight: highlight ? 700 : 500, wordBreak: 'break-word' }}>{value ?? '—'}</span>
    </div>
);

const AccountRecoveryAdminPage: React.FC = () => {
    const { addToast } = useToast();
    const [requests, setRequests] = useState<RecoverySummary[]>([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [isListLoading, setIsListLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<RecoveryDetail | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [isActing, setIsActing] = useState(false);

    const loadList = useCallback(async () => {
        setIsListLoading(true);
        try {
            setRequests(await listRecoveryRequests(statusFilter || undefined));
        } catch {
            addToast('Failed to load recovery requests', 'error');
        } finally {
            setIsListLoading(false);
        }
    }, [statusFilter, addToast]);

    useEffect(() => {
        loadList();
    }, [loadList]);

    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        let cancelled = false;
        setIsDetailLoading(true);
        getRecoveryDetail(selectedId)
            .then((data) => {
                if (!cancelled) {
                    setDetail(data);
                }
            })
            .catch(() => addToast('Failed to load request details', 'error'))
            .finally(() => {
                if (!cancelled) {
                    setIsDetailLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [selectedId, addToast]);

    const runAction = async (action: () => Promise<RecoveryDetail>, successMessage: string) => {
        setIsActing(true);
        try {
            const updated = await action();
            setDetail(updated);
            addToast(successMessage, 'success');
            await loadList();
        } catch (error: any) {
            addToast(error?.response?.data?.detail || error?.response?.data?.message || 'Action failed', 'error');
        } finally {
            setIsActing(false);
        }
    };

    const handleChecklistToggle = async (key: string, passed: boolean) => {
        if (!detail || detail.status !== 'Pending') {
            return;
        }
        const items = detail.checklist.map((item) => ({
            key: item.key,
            passed: item.key === key ? (item.passed === passed ? null : passed) : item.passed
        }));
        await runAction(() => updateRecoveryChecklist(detail.id, items), 'Checklist saved');
    };

    const handleReject = async () => {
        if (!detail) {
            return;
        }
        const reason = window.prompt('Reason for rejection (sent to the requester):') ?? undefined;
        if (reason === undefined) {
            return;
        }
        await runAction(() => rejectRecovery(detail.id, reason), 'Request rejected');
    };

    const checklistComplete = detail?.checklist.every((item) => item.passed !== null) ?? false;
    const checklistAllPassed = detail?.checklist.every((item) => item.passed === true) ?? false;
    const waitingOver = detail?.executeAfter ? new Date(detail.executeAfter).valueOf() <= Date.now() : false;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            {/* Очередь заявок */}
            <div style={{ ...sectionStyle, gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <h3 style={sectionTitleStyle}>Recovery requests</h3>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                        <option value="">All statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Executed">Executed</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
                {isListLoading ? (
                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Loading…</p>
                ) : requests.length === 0 ? (
                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>No requests.</p>
                ) : (
                    requests.map((request) => (
                        <button
                            key={request.id}
                            type="button"
                            onClick={() => setSelectedId(request.id)}
                            style={{
                                textAlign: 'left',
                                border: request.id === selectedId ? '1px solid #7c3aed' : '1px solid #e5e7eb',
                                background: request.id === selectedId ? '#f5f3ff' : '#ffffff',
                                borderRadius: 10,
                                padding: '10px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                                <strong style={{ fontSize: 13 }}>{request.publicId}</strong>
                                <StatusPill status={request.status} />
                            </div>
                            <span style={{ fontSize: 13, wordBreak: 'break-all' }}>{request.accountEmail}</span>
                            <span style={{ fontSize: 12, color: '#6b7280' }}>
                                {formatDate(request.createdAt)}{!request.accountFound && ' · account not found'}
                            </span>
                        </button>
                    ))
                )}
            </div>

            {/* Карточка заявки */}
            {!detail ? (
                <div style={{ ...sectionStyle, alignItems: 'center', padding: 40 }}>
                    <p style={{ margin: 0, color: '#6b7280' }}>{isDetailLoading ? 'Loading…' : 'Select a request to review.'}</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: isDetailLoading ? 0.6 : 1 }}>
                    {/* Шапка и действия */}
                    <div style={{ ...sectionStyle, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <h3 style={{ ...sectionTitleStyle, fontSize: 17 }}>{detail.publicId}</h3>
                            <StatusPill status={detail.status} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {detail.status === 'Pending' && (
                                <>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled={isActing || !checklistComplete || !checklistAllPassed || !detail.account.found}
                                        title={!checklistComplete ? 'Complete the checklist first' : !checklistAllPassed ? 'Some checks failed — approve is blocked' : undefined}
                                        onClick={() => runAction(() => approveRecovery(detail.id), 'Approved — waiting period started')}
                                    >
                                        Approve (start 72h wait)
                                    </button>
                                    <button type="button" className="btn btn-outline" disabled={isActing} onClick={handleReject}>
                                        Reject
                                    </button>
                                </>
                            )}
                            {detail.status === 'Approved' && (
                                <>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled={isActing || !waitingOver}
                                        title={!waitingOver ? `Waiting period ends ${formatDate(detail.executeAfter)}` : undefined}
                                        onClick={() => runAction(() => executeRecovery(detail.id), '2FA reset executed')}
                                    >
                                        {waitingOver ? 'Execute reset' : `Locked until ${formatDate(detail.executeAfter)}`}
                                    </button>
                                    <button type="button" className="btn btn-outline" disabled={isActing} onClick={handleReject}>
                                        Reject
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        {/* Что заявил человек */}
                        <div style={sectionStyle}>
                            <h4 style={sectionTitleStyle}>Claimed by requester</h4>
                            <FactRow label="Account email" value={detail.accountEmail} highlight />
                            <FactRow label="Contact email" value={detail.contactEmail} />
                            <FactRow label="Order numbers" value={detail.claimedOrderNumbers || '—'} highlight />
                            <FactRow label="Card last 4" value={detail.claimedCardLast4 || '—'} highlight />
                            {detail.message && (
                                <div style={{ fontSize: 13, background: '#f9fafb', borderRadius: 8, padding: 10, whiteSpace: 'pre-wrap' }}>{detail.message}</div>
                            )}
                            <FactRow label="Submitted" value={formatDate(detail.createdAt)} />
                            <FactRow label="From IP" value={detail.requestIp} highlight />
                            <FactRow label="User agent" value={<span style={{ fontSize: 11 }}>{detail.requestUserAgent || '—'}</span>} />
                        </div>

                        {/* Что говорят наши данные */}
                        <div style={sectionStyle}>
                            <h4 style={sectionTitleStyle}>Account snapshot</h4>
                            {!detail.account.found ? (
                                <p style={{ margin: 0, color: '#991b1b', fontSize: 13, fontWeight: 600 }}>
                                    No account with this email exists in Keycloak.
                                </p>
                            ) : (
                                <>
                                    <FactRow label="Username" value={detail.account.username} />
                                    <FactRow label="Email verified" value={detail.account.emailVerified ? 'yes' : 'no'} />
                                    <FactRow label="Account created" value={formatDate(detail.account.accountCreatedAt)} />
                                    <FactRow label="2FA" value={detail.account.twoFactorEnabled ? 'enabled' : 'disabled'} />
                                    <FactRow
                                        label="Backup codes"
                                        value={detail.account.backupCodesGenerated
                                            ? `generated${detail.account.backupCodesRemaining != null ? ` (${detail.account.backupCodesRemaining} left)` : ''}`
                                            : 'not generated'}
                                    />
                                    <FactRow label="Active sessions" value={detail.account.activeSessions.length} highlight />
                                    {detail.account.activeSessions.slice(0, 5).map((session, index) => (
                                        <div key={index} style={{ fontSize: 12, color: '#6b7280' }}>
                                            {session.ipAddress} · last active {formatDate(session.lastAccess)}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>

                    {detail.account.found && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                            {/* Заказы — сверять с заявленными номерами/суммами */}
                            <div style={sectionStyle}>
                                <h4 style={sectionTitleStyle}>Recent orders ({detail.account.recentOrders.length})</h4>
                                {detail.account.recentOrders.length === 0 ? (
                                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>No orders on record.</p>
                                ) : (
                                    detail.account.recentOrders.map((order, index) => (
                                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, borderBottom: '1px solid #f3f4f6', paddingBottom: 6 }}>
                                            <span>
                                                <strong>{order.orderNumber || 'no number'}</strong> · {order.gameName}
                                            </span>
                                            <span style={{ whiteSpace: 'nowrap', color: '#6b7280' }}>
                                                {order.totalAmount != null ? `${order.totalAmount} ${order.currency ?? ''}` : '—'} · {formatDate(order.createdAt)}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Входы — сверять географию с IP заявки */}
                            <div style={sectionStyle}>
                                <h4 style={sectionTitleStyle}>Login events</h4>
                                {detail.account.loginEventsError ? (
                                    <p style={{ margin: 0, color: '#92400e', fontSize: 13 }}>{detail.account.loginEventsError}</p>
                                ) : detail.account.loginEvents.length === 0 ? (
                                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>No recent events.</p>
                                ) : (
                                    detail.account.loginEvents.slice(0, 10).map((event, index) => (
                                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                                            <span>{event.type.toLowerCase()}</span>
                                            <span style={{ color: event.ipAddress === detail.requestIp ? '#166534' : '#6b7280', fontWeight: event.ipAddress === detail.requestIp ? 700 : 400 }}>
                                                {event.ipAddress ?? '—'} · {formatDate(event.time)}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Чек-лист сверки */}
                    <div style={sectionStyle}>
                        <h4 style={sectionTitleStyle}>Verification checklist</h4>
                        <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
                            Every item must be checked before approval. Approve is blocked while any check is unset or failed.
                        </p>
                        {detail.checklist.map((item) => (
                            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 13 }}>{item.label}</span>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => handleChecklistToggle(item.key, true)}
                                        disabled={detail.status !== 'Pending' || isActing}
                                        style={{
                                            border: '1px solid',
                                            borderColor: item.passed === true ? '#16a34a' : '#e5e7eb',
                                            background: item.passed === true ? '#dcfce7' : '#ffffff',
                                            color: '#166534',
                                            borderRadius: 8,
                                            padding: '4px 10px',
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            fontWeight: 700
                                        }}
                                    >
                                        Match
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleChecklistToggle(item.key, false)}
                                        disabled={detail.status !== 'Pending' || isActing}
                                        style={{
                                            border: '1px solid',
                                            borderColor: item.passed === false ? '#dc2626' : '#e5e7eb',
                                            background: item.passed === false ? '#fee2e2' : '#ffffff',
                                            color: '#991b1b',
                                            borderRadius: 8,
                                            padding: '4px 10px',
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            fontWeight: 700
                                        }}
                                    >
                                        Fail
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Журнал */}
                    <div style={sectionStyle}>
                        <h4 style={sectionTitleStyle}>Audit log</h4>
                        {detail.auditLog.slice().reverse().map((entry, index) => (
                            <div key={index} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                                <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{formatDate(entry.at)}</span>
                                <span>
                                    <strong>{entry.actor}</strong> — {entry.action}
                                    {entry.details ? ` (${entry.details})` : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountRecoveryAdminPage;
