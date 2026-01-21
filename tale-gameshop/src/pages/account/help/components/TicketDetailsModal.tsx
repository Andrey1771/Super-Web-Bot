import React, {useEffect, useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {getTicketDetails, postTicketMessage, resolveTicket, uploadTicketAttachment} from '../../../../api/supportApi';
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
        return 'Just now';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const TicketDetailsModal: React.FC<TicketDetailsModalProps> = ({isOpen, onClose, ticketId, initialTicket}) => {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [ticket, setTicket] = useState<TicketDetails | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [reply, setReply] = useState('');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const isClosed = ticket?.status === 'Closed';

    const headerTitle = useMemo(() => {
        if (ticket) {
            return `Request #${ticket.publicId} — ${ticket.subject}`;
        }
        if (initialTicket) {
            return `Request #${initialTicket.publicId ?? initialTicket.id} — ${initialTicket.subject}`;
        }
        return 'Request details';
    }, [initialTicket, ticket]);

    const headerUpdatedAt = useMemo(() => {
        if (ticket) {
            return `Last updated: ${formatRelativeTime(ticket.updatedAt)}`;
        }
        return undefined;
    }, [ticket]);

    const loadTicket = async (currentTicketId: string, isActive: () => boolean) => {
        setIsLoading(true);
        setError('');

        try {
            const data = await getTicketDetails(currentTicketId);
            if (isActive()) {
                setTicket({ ...data, messages: data.messages ?? [] });
            }
        } catch {
            if (isActive()) {
                setError('Failed to load ticket. Retry.');
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
        if (!ticket || !ticketId || !reply.trim()) {
            return;
        }

        setIsSending(true);
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
        } finally {
            setIsSending(false);
        }
    };

    const handleResolve = async () => {
        if (!ticketId) {
            return;
        }
        setIsSending(true);
        try {
            await resolveTicket(ticketId);
            setTicket((prev) => (prev ? { ...prev, status: 'Resolved' } : prev));
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
                        <p className="ticket-modal__title">Ticket details</p>
                        <h2 id="ticket-details-title">{headerTitle}</h2>
                        {headerUpdatedAt && <p className="ticket-modal__subtitle">{headerUpdatedAt}</p>}
                    </div>
                    <button type="button" className="ticket-modal__close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <div className="ticket-modal__body">
                    <div className="ticket-modal__left">
                        {isLoading && <div className="ticket-modal__skeleton">Loading ticket...</div>}
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
                                    Retry
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
                            {isClosed && <div className="ticket-modal__closed">This request is closed.</div>}
                            <textarea
                                placeholder="Write a reply…"
                                value={reply}
                                onChange={(event) => setReply(event.target.value)}
                                disabled={isClosed}
                            />
                            <div className="ticket-modal__composer-actions">
                                <button
                                    type="button"
                                    className="btn btn-outline ticket-modal__attach-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isClosed}
                                >
                                    Attach file
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
                                    disabled={isClosed || !reply.trim() || isSending || isUploading}
                                >
                                    {isSending ? 'Sending...' : 'Send reply'}
                                </button>
                            </div>
                            {pendingFiles.length > 0 && (
                                <div className="ticket-modal__uploading">
                                    {isUploading ? 'Uploading attachments...' : `${pendingFiles.length} files ready to upload`}
                                </div>
                            )}
                            <div className="ticket-modal__tips">
                                <span>Please don’t share full card numbers.</span>
                            </div>
                        </div>
                    </div>

                    <div className="ticket-modal__right">
                        {ticket && (
                            <TicketSidebar
                                ticket={ticket}
                                isWorking={isSending}
                                onResolve={handleResolve}
                            />
                        )}
                        <div className="ticket-modal__footer-actions">
                            <button type="button" className="btn btn-outline" onClick={onClose}>
                                Close
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary ticket-modal__problem-solved"
                                onClick={handleResolve}
                                disabled={isSending}
                            >
                                Problem solved
                            </button>
                        </div>
                    </div>
                </div>
                <div className="ticket-modal__footer-note">
                    This request is resolved. Need more help?{' '}
                    <button type="button" className="ticket-modal__link" onClick={handleResolve}>
                        Reopen
                    </button>{' '}
                    your request.
                </div>
            </div>
        </div>,
        document.body
    );
};

export default TicketDetailsModal;
