import { useTranslation } from 'react-i18next';
import i18n from '../../../../i18n';
import { serverErrorText } from '../../../../utils/api-error';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {getTicketDetails, postTicketMessage, reopenTicket, resolveTicket, uploadTicketAttachment} from '../../../../api/supportApi';
import type {SupportMessage, TicketDetails, TicketSummary} from '../../../../types/support';
import TicketConversation from './TicketConversation';
import TicketSidebar from './TicketSidebar';
import './ticket-details-modal.css';

interface TicketDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticketId: string | null;
    initialTicket?: TicketSummary;
}

const formatRelativeTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) {
        return i18n.t('common.justNowShort');
    }
    if (diffMinutes < 60) {
        return i18n.t('common.minAgo', { count: diffMinutes });
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return i18n.t('common.hoursAgo', { count: diffHours });
    }
    const diffDays = Math.floor(diffHours / 24);
    return i18n.t('common.daysAgo', { count: diffDays });
};

const TicketDetailsModal: React.FC<TicketDetailsModalProps> = ({isOpen, onClose, ticketId, initialTicket}) => {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [ticket, setTicket] = useState<TicketDetails | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    // Ошибки действий (отправка/переоткрытие) показываем баннером у композера,
    // не затирая переписку (error скрывает весь диалог — он только для ошибок загрузки).
    const [actionError, setActionError] = useState('');
    const [reply, setReply] = useState('');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const isClosed = ticket?.status === 'Closed';
    // Бэкенд запрещает клиенту писать и в Resolved, и в Closed (409 «Reopen to reply») —
    // композер должен блокироваться в обоих статусах, а не только в Closed.
    const isResolved = ticket?.status === 'Resolved';
    const isLocked = isClosed || isResolved;

    const headerTitle = useMemo(() => {
        if (ticket) {
            return t('ticket.requestTitle', { id: ticket.publicId, subject: ticket.subject });
        }
        if (initialTicket) {
            return t('ticket.requestTitle', { id: initialTicket.publicId ?? initialTicket.id, subject: initialTicket.subject });
        }
        return t('ticket.requestDetails');
    }, [initialTicket, ticket, t]);

    const headerUpdatedAt = useMemo(() => {
        if (ticket) {
            return t('ticket.lastUpdated', { when: formatRelativeTime(ticket.updatedAt) });
        }
        return undefined;
    }, [ticket, t]);

    const loadTicket = async (currentTicketId: string, isActive: () => boolean) => {
        setIsLoading(true);
        setError('');
        setActionError('');

        try {
            const data = await getTicketDetails(currentTicketId);
            if (isActive()) {
                setTicket({ ...data, messages: data.messages ?? [] });
            }
        } catch {
            if (isActive()) {
                setError(t('ticket.loadFailed'));
            }
        } finally {
            if (isActive()) {
                setIsLoading(false);
            }
        }
    };

    useEffect(() => {
        if (!isOpen || !ticketId) {
            return;
        }

        let active = true;
        void loadTicket(ticketId, () => active);

        return () => {
            active = false;
        };
    }, [isOpen, ticketId]);

    // Пока модалка открыта — тихо подтягиваем ответы поддержки и смену статуса
    // (без websocket: тикеты асинхронны, 5с-polling как в live-chat достаточно).
    const isBusyRef = useRef(false);
    isBusyRef.current = isSending || isUploading;

    useEffect(() => {
        if (!isOpen || !ticketId) {
            return;
        }

        let active = true;
        const interval = window.setInterval(async () => {
            if (isBusyRef.current) {
                return; // не затираем оптимистичные обновления во время отправки
            }
            try {
                const data = await getTicketDetails(ticketId);
                if (active && !isBusyRef.current) {
                    setTicket({ ...data, messages: data.messages ?? [] });
                }
            } catch {
                // тихий poll: ошибку не показываем, следующая попытка через интервал
            }
        }, 5000);

        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [isOpen, ticketId]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const dialog = dialogRef.current;
            if (!dialog) {
                return;
            }

            const focusable = Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                )
            ).filter((element) => !element.hasAttribute('disabled'));

            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const activeElement = document.activeElement as HTMLElement | null;

            if (event.shiftKey) {
                if (!activeElement || activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (!activeElement || activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) {
            setReply('');
            setPendingFiles([]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !ticket) {
            return;
        }
        const timeline = dialogRef.current?.querySelector<HTMLDivElement>('.ticket-conversation__timeline');
        if (timeline) {
            timeline.scrollTop = timeline.scrollHeight;
        }
    }, [isOpen, ticket?.messages.length]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files) {
            return;
        }
        setPendingFiles(Array.from(event.target.files));
        event.target.value = '';
    };

    const appendMessage = (message: SupportMessage) => {
        setTicket((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                messages: [...prev.messages, message]
            };
        });
    };

    const handleSend = async () => {
        if (!ticket || !ticketId || !reply.trim() || isLocked) {
            return;
        }

        setIsSending(true);
        setActionError('');
        try {
            const message = await postTicketMessage(ticketId, reply.trim());
            appendMessage(message);

            if (pendingFiles.length > 0) {
                setIsUploading(true);
                try {
                    const attachments = await uploadTicketAttachment(ticketId, message.id, pendingFiles);
                    setTicket((prev) => {
                        if (!prev) {
                            return prev;
                        }
                        return {
                            ...prev,
                            messages: prev.messages.map((item) =>
                                item.id === message.id
                                    ? {
                                          ...item,
                                          attachments
                                      }
                                    : item
                            )
                        };
                    });
                } finally {
                    setIsUploading(false);
                    setPendingFiles([]);
                }
            }

            setReply('');
        } catch (sendError: any) {
            // Показываем причину от сервера (например, 409 «Reopen to reply»), а не молча глотаем.
            setActionError(serverErrorText(sendError, t('ticket.sendFailed')));
        } finally {
            setIsSending(false);
        }
    };

    const handleResolve = async () => {
        if (!ticketId) {
            return;
        }
        setIsSending(true);
        setActionError('');
        try {
            await resolveTicket(ticketId);
            setTicket((prev) => (prev ? { ...prev, status: 'Resolved' } : prev));
        } catch (resolveError: any) {
            setActionError(serverErrorText(resolveError, t('ticket.resolveFailed')));
        } finally {
            setIsSending(false);
        }
    };

    const handleReopen = async () => {
        if (!ticketId) {
            return;
        }
        setIsSending(true);
        setActionError('');
        try {
            await reopenTicket(ticketId);
            await loadTicket(ticketId, () => true);
        } catch (reopenError: any) {
            // Например, 429 «Too many reopen attempts» или 409 «closed by support» — человек должен видеть причину.
            setActionError(serverErrorText(reopenError, t('ticket.reopenFailed')));
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    return ReactDOM.createPortal(
        <div
            className="ticket-modal__overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className="ticket-modal__dialog"
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="ticket-details-title"
            >
                <div className="ticket-modal__header">
                    <div className="ticket-modal__header-content">
                        <p className="ticket-modal__title">{t('ticket.details')}</p>
                        <h2 id="ticket-details-title">{headerTitle}</h2>
                        {headerUpdatedAt && <p className="ticket-modal__subtitle">{headerUpdatedAt}</p>}
                    </div>
                    <button type="button" className="ticket-modal__close" onClick={onClose} aria-label={t('common.close')}>
                        ×
                    </button>
                </div>

                <div className="ticket-modal__body">
                    <div className="ticket-modal__left">
                        {isLoading && <div className="ticket-modal__skeleton">{t('ticket.loading')}</div>}
                        {error && (
                            <div className="ticket-modal__error">
                                <span>{error}</span>
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => {
                                        if (ticketId) {
                                            void loadTicket(ticketId, () => true);
                                        }
                                    }}
                                >
                                    {t('common.retry')}
                                </button>
                            </div>
                        )}
                        {!isLoading && !error && ticket && (
                            <TicketConversation
                                messages={ticket.messages}
                                formatRelativeTime={formatRelativeTime}
                            />
                        )}

                        <div className="ticket-modal__composer">
                            {actionError && (
                                <div className="ticket-modal__action-error" role="alert">
                                    {actionError}
                                </div>
                            )}
                            {isClosed && <div className="ticket-modal__closed">{t('ticket.closed')}</div>}
                            {isResolved && (
                                <div className="ticket-modal__closed">
                                    {t('ticket.resolved')}
                                </div>
                            )}
                            <textarea
                                placeholder={isLocked ? t('ticket.reopenToReply') : t('ticket.writeReply')}
                                value={reply}
                                onChange={(event) => setReply(event.target.value)}
                                disabled={isLocked}
                            />
                            <div className="ticket-modal__composer-actions">
                                <button
                                    type="button"
                                    className="btn btn-outline ticket-modal__attach-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLocked}
                                >
                                    {t('ticket.attachFile')}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    className="ticket-modal__file-input"
                                    onChange={handleFileSelect}
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleSend}
                                    disabled={isLocked || !reply.trim() || isSending || isUploading}
                                >
                                    {isSending ? t('common.sending') : t('ticket.sendReply')}
                                </button>
                            </div>
                            {pendingFiles.length > 0 && (
                                <div className="ticket-modal__uploading">
                                    {isUploading ? t('ticket.uploading') : t('ticket.filesReady', { count: pendingFiles.length })}
                                </div>
                            )}
                            <div className="ticket-modal__tips">
                                <span>{t('ticket.noCardNumbers')}</span>
                            </div>
                        </div>
                    </div>

                    <div className="ticket-modal__right">
                        {ticket && (
                            <TicketSidebar
                                ticket={ticket}
                                isWorking={isSending}
                                onResolve={handleResolve}
                                onReopen={handleReopen}
                            />
                        )}
                        <div className="ticket-modal__footer-actions">
                            <button type="button" className="btn btn-outline" onClick={onClose}>
                                {t('common.close')}
                            </button>
                            {ticket && ticket.status !== 'Resolved' && !isClosed && (
                                <button
                                    type="button"
                                    className="btn btn-primary ticket-modal__problem-solved"
                                    onClick={handleResolve}
                                    disabled={isSending}
                                >
                                    {t('ticket.problemSolved')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                {ticket?.status === 'Resolved' && (
                    <div className="ticket-modal__footer-note">
                        {t('ticket.resolvedNeedMore')}{' '}
                        <button type="button" className="ticket-modal__link" onClick={handleReopen}>
                            {t('ticket.reopen')}
                        </button>{' '}
                        {t('ticket.yourRequest')}
                    </div>
                )}
                {isClosed && (
                    <div className="ticket-modal__footer-note">
                        {t('ticket.closedBySupport')}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default TicketDetailsModal;
