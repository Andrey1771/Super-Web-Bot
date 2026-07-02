import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/ui/ToastProvider';
import {
    AdminTicketDetails,
    AdminTicketSummary,
    closeAdminTicket,
    downloadAdminAttachment,
    getAdminTicketDetails,
    listAdminTickets,
    postAdminTicketMessage,
    resolveAdminTicket,
    uploadAdminAttachments
} from '../../api/adminSupportApi';
import type { TicketStatus } from '../../types/support';

// Рабочее место поддержки: все тикеты клиентов, ответы от имени Support, resolve/close.
// Ответы клиентов приходят через страницу аккаунта (Help) и авторятся как User.

const PAGE_SIZE = 10;

const statusLabels: Record<TicketStatus, string> = {
    Open: 'Open',
    WaitingForSupport: 'Waiting for support',
    WaitingForUser: 'Waiting for user',
    Resolved: 'Resolved',
    Closed: 'Closed'
};

const statusColors: Record<TicketStatus, { bg: string; fg: string }> = {
    Open: { bg: '#ede9fe', fg: '#5b21b6' },
    WaitingForSupport: { bg: '#fef3c7', fg: '#92400e' },
    WaitingForUser: { bg: '#dbeafe', fg: '#1e40af' },
    Resolved: { bg: '#dcfce7', fg: '#166534' },
    Closed: { bg: '#e5e7eb', fg: '#374151' }
};

const StatusPill: React.FC<{ status: TicketStatus }> = ({ status }) => {
    const colors = statusColors[status] ?? statusColors.Open;
    return (
        <span
            style={{
                background: colors.bg,
                color: colors.fg,
                borderRadius: 999,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap'
            }}
        >
            {statusLabels[status] ?? status}
        </span>
    );
};

const formatDate = (value?: string) => {
    if (!value) {
        return '—';
    }
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString();
};

const SupportTicketsPage: React.FC = () => {
    const { addToast } = useToast();
    const [tickets, setTickets] = useState<AdminTicketSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [isListLoading, setIsListLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [details, setDetails] = useState<AdminTicketDetails | null>(null);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [reply, setReply] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Лимиты бэкенда (SupportOptions): png/jpeg/pdf, до 10 МБ, максимум 5 файлов на сообщение.
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
    const MAX_FILE_MB = 10;
    const MAX_FILES = 5;

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const loadTickets = useCallback(async () => {
        setIsListLoading(true);
        try {
            const data = await listAdminTickets({ status: statusFilter, q: search, page, pageSize: PAGE_SIZE });
            setTickets(data.items);
            setTotal(data.total);
        } catch (error) {
            console.error(error);
            addToast('Failed to load tickets.', 'error');
        } finally {
            setIsListLoading(false);
        }
    }, [addToast, page, search, statusFilter]);

    useEffect(() => {
        loadTickets();
    }, [loadTickets]);

    const loadDetails = useCallback(async (ticketId: string) => {
        setIsDetailsLoading(true);
        try {
            const data = await getAdminTicketDetails(ticketId);
            setDetails(data);
        } catch (error) {
            console.error(error);
            addToast('Failed to load ticket details.', 'error');
        } finally {
            setIsDetailsLoading(false);
        }
    }, [addToast]);

    const handleSelect = (ticketId: string) => {
        setSelectedId(ticketId);
        setReply('');
        setPendingFiles([]);
        loadDetails(ticketId);
    };

    const handleFilesChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
        const chosen = Array.from(event.target.files ?? []);
        event.target.value = '';
        const next: File[] = [...pendingFiles];
        for (const file of chosen) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                addToast(`"${file.name}": only PNG, JPEG or PDF.`, 'error');
                continue;
            }
            if (file.size > MAX_FILE_MB * 1024 * 1024) {
                addToast(`"${file.name}" exceeds ${MAX_FILE_MB}MB.`, 'error');
                continue;
            }
            if (next.length >= MAX_FILES) {
                addToast(`Max ${MAX_FILES} files per message.`, 'error');
                break;
            }
            next.push(file);
        }
        setPendingFiles(next);
    };

    // Тихий polling открытого тикета: новые сообщения клиента и статусы приходят сами (как в live-chat).
    useEffect(() => {
        if (!selectedId) {
            return;
        }
        const interval = window.setInterval(async () => {
            if (isSending) {
                return;
            }
            try {
                const data = await getAdminTicketDetails(selectedId);
                setDetails(data);
            } catch {
                // тихий poll
            }
        }, 5000);
        return () => window.clearInterval(interval);
    }, [selectedId, isSending]);

    // Список тикетов обновляем реже — новые обращения и смены статусов.
    useEffect(() => {
        const interval = window.setInterval(async () => {
            try {
                const data = await listAdminTickets({ status: statusFilter, q: search, page, pageSize: PAGE_SIZE });
                setTickets(data.items);
                setTotal(data.total);
            } catch {
                // тихий poll
            }
        }, 15000);
        return () => window.clearInterval(interval);
    }, [statusFilter, search, page]);

    const handleReply = async () => {
        if (!selectedId || !reply.trim()) {
            return;
        }
        setIsSending(true);
        try {
            const message = await postAdminTicketMessage(selectedId, reply.trim());
            if (pendingFiles.length > 0) {
                try {
                    await uploadAdminAttachments(selectedId, message.id, pendingFiles);
                } catch (uploadError) {
                    console.error(uploadError);
                    addToast('Reply sent, but attachments failed to upload.', 'error');
                }
            }
            setReply('');
            setPendingFiles([]);
            await loadDetails(selectedId);
            await loadTickets();
            addToast('Reply sent as support.', 'success');
        } catch (error) {
            console.error(error);
            addToast('Failed to send reply.', 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleResolve = async () => {
        if (!selectedId) {
            return;
        }
        try {
            await resolveAdminTicket(selectedId);
            await loadDetails(selectedId);
            await loadTickets();
            addToast('Ticket resolved.', 'success');
        } catch (error) {
            console.error(error);
            addToast('Failed to resolve ticket.', 'error');
        }
    };

    const handleClose = async () => {
        if (!selectedId) {
            return;
        }
        try {
            await closeAdminTicket(selectedId);
            await loadDetails(selectedId);
            await loadTickets();
            addToast('Ticket closed.', 'success');
        } catch (error) {
            console.error(error);
            addToast('Failed to close ticket.', 'error');
        }
    };

    const handleDownload = async (attachmentId: string, fileName: string) => {
        try {
            const blob = await downloadAdminAttachment(attachmentId);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            addToast('Failed to download attachment.', 'error');
        }
    };

    const detailsTicket = details?.ticket;
    const canReply = Boolean(detailsTicket && detailsTicket.status !== 'Closed');

    const conversation = useMemo(() => details?.messages ?? [], [details]);

    return (
        <div className="admin-grid">
            <div className="admin-card">
                <h2>Support tickets</h2>
                <p style={{ color: '#6b7280' }}>
                    Все обращения клиентов. Ответы отсюда отправляются от имени поддержки.
                </p>
                <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 12 }}>
                    <input
                        className="input"
                        style={{ maxWidth: 280 }}
                        placeholder="Search by subject / TKT id..."
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />
                    <select
                        className="input"
                        style={{ maxWidth: 220 }}
                        value={statusFilter}
                        onChange={(event) => {
                            setStatusFilter(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">All statuses</option>
                        <option value="Open">Open</option>
                        <option value="WaitingForSupport">Waiting for support</option>
                        <option value="WaitingForUser">Waiting for user</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                    </select>
                    <button className="btn btn-outline" onClick={loadTickets} disabled={isListLoading}>
                        {isListLoading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>

                {isListLoading ? (
                    <div className="space-y-3">
                        <div className="skeleton h-10" />
                        <div className="skeleton h-10" />
                        <div className="skeleton h-10" />
                    </div>
                ) : tickets.length === 0 ? (
                    <p style={{ color: '#6b7280' }}>No tickets found.</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Request</th>
                                <th>Subject</th>
                                <th>User</th>
                                <th>Status</th>
                                <th>Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.map((ticket) => (
                                <tr
                                    key={ticket.id}
                                    className={ticket.id === selectedId ? 'admin-table__row-selected' : ''}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => handleSelect(ticket.id)}
                                >
                                    <td><strong>#{ticket.publicId}</strong></td>
                                    <td className="admin-table__cell-truncate" title={ticket.subject}>{ticket.subject}</td>
                                    <td className="admin-table__cell-muted">{ticket.userEmail || '—'}</td>
                                    <td><StatusPill status={ticket.status} /></td>
                                    <td className="admin-table__cell-muted">{formatDate(ticket.updatedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {totalPages > 1 && (
                    <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
                        <button
                            className="btn btn-outline"
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={page <= 1}
                        >
                            ‹
                        </button>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>
                            Page {page} of {totalPages} · {total} tickets
                        </span>
                        <button
                            className="btn btn-outline"
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={page >= totalPages}
                        >
                            ›
                        </button>
                    </div>
                )}
            </div>

            {selectedId && (
                <div className="admin-card">
                    {isDetailsLoading || !detailsTicket ? (
                        <div className="space-y-3">
                            <div className="skeleton h-10" />
                            <div className="skeleton h-20" />
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <h3>
                                        #{detailsTicket.publicId} — {detailsTicket.subject}
                                    </h3>
                                    <p style={{ color: '#6b7280', margin: '4px 0 0' }}>
                                        {detailsTicket.userEmail || 'unknown user'} · {detailsTicket.category} ·{' '}
                                        <StatusPill status={detailsTicket.status} />
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="btn btn-outline"
                                        onClick={handleResolve}
                                        disabled={detailsTicket.status === 'Resolved' || detailsTicket.status === 'Closed'}
                                    >
                                        Resolve
                                    </button>
                                    <button
                                        className="btn btn-outline"
                                        onClick={handleClose}
                                        disabled={detailsTicket.status === 'Closed'}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div
                                style={{
                                    marginTop: 16,
                                    display: 'grid',
                                    gap: 10,
                                    maxHeight: 420,
                                    overflowY: 'auto',
                                    paddingRight: 6
                                }}
                            >
                                {conversation.map((message) => {
                                    const isSupport = message.authorType === 'Support';
                                    const isSystem = message.authorType === 'System';
                                    return (
                                        <div
                                            key={message.id}
                                            style={{
                                                justifySelf: isSystem ? 'center' : isSupport ? 'end' : 'start',
                                                maxWidth: isSystem ? '100%' : '75%',
                                                background: isSystem ? 'transparent' : isSupport ? '#ede9fe' : '#f3f4f6',
                                                color: isSystem ? '#9ca3af' : '#111827',
                                                borderRadius: 12,
                                                padding: isSystem ? '2px 8px' : '10px 14px',
                                                fontSize: isSystem ? 12 : 14
                                            }}
                                        >
                                            {!isSystem && (
                                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: isSupport ? '#5b21b6' : '#374151' }}>
                                                    {isSupport ? `Support · ${message.authorName}` : message.authorName || 'Customer'}
                                                </div>
                                            )}
                                            <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
                                            {(message.attachments ?? []).map((attachment) => (
                                                <button
                                                    key={attachment.id}
                                                    type="button"
                                                    className="btn btn-outline"
                                                    style={{ marginTop: 6, fontSize: 12, height: 30, paddingInline: 10 }}
                                                    onClick={() => handleDownload(attachment.id, attachment.fileName)}
                                                >
                                                    📎 {attachment.fileName}
                                                </button>
                                            ))}
                                            {!isSystem && (
                                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                                                    {formatDate(message.createdAt)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: 16 }}>
                                <textarea
                                    className="input"
                                    rows={3}
                                    placeholder={canReply ? 'Reply as support...' : 'Ticket is closed.'}
                                    value={reply}
                                    onChange={(event) => setReply(event.target.value)}
                                    disabled={!canReply || isSending}
                                />
                                {pendingFiles.length > 0 && (
                                    <div className="flex gap-2 flex-wrap" style={{ marginTop: 8 }}>
                                        {pendingFiles.map((file, index) => (
                                            <span
                                                key={`${file.name}-${index}`}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    background: '#f3f0ff',
                                                    border: '1px solid #e2ddff',
                                                    borderRadius: 999,
                                                    padding: '4px 10px',
                                                    fontSize: 12
                                                }}
                                            >
                                                📎 {file.name} ({(file.size / 1024).toFixed(0)} KB)
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${file.name}`}
                                                    onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex justify-between items-center" style={{ marginTop: 8 }}>
                                    <div>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            accept="image/png,image/jpeg,application/pdf"
                                            style={{ display: 'none' }}
                                            onChange={handleFilesChosen}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={!canReply || isSending || pendingFiles.length >= MAX_FILES}
                                        >
                                            📎 Attach files
                                        </button>
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleReply}
                                        disabled={!canReply || isSending || !reply.trim()}
                                    >
                                        {isSending ? 'Sending...' : 'Send as support'}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default SupportTicketsPage;
