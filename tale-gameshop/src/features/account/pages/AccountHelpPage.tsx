import React, {useCallback, useEffect, useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronDown, faFileLines} from '@fortawesome/free-solid-svg-icons';
import AccountShell from '../components/AccountShell';
import NewSupportRequestModal from '../components/NewSupportRequestModal';
import {listSupportTickets} from '../support/supportApi';
import type {SupportTicket, SupportTicketStatus} from '../support/types';
import TicketDetailsModal from '../../../pages/account/help/components/TicketDetailsModal';
import type {TicketSummary} from '../../../types/support';
import './account-help-page.css';

const faqItems = [
    {
        question: 'Where is my game key?',
        answer:
            'Keys are delivered instantly after payment, but some banks need additional checks. ' +
            'If it has been more than 30 minutes, refresh your orders page or contact support.'
    },
    {question: 'How do refunds work?'},
    {question: 'Payment was charged but order is missing'},
    {question: 'How to download an invoice?'},
    {question: 'How to activate a Steam key?'},
    {question: 'How to secure my account?'}
];

const guideLinks = ['Activation guide', 'Refund policy', 'Payment methods', 'Regional restrictions'];

const systemStatuses = [
    {label: 'Store', status: 'Operational'},
    {label: 'Checkout', status: 'Operational'},
    {label: 'Key delivery', status: 'Operational'},
    {label: 'Support чат', status: 'Operational'}
];

const AccountHelpPage: React.FC = () => {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [selectedTicketSummary, setSelectedTicketSummary] = useState<TicketSummary | undefined>();
    const [toastMessage, setToastMessage] = useState<string | null>(null);

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

    const statusLabelFor = (status: SupportTicketStatus) => {
        if (typeof status === 'number') {
            const statusMap: Record<number, string> = {
                0: 'Open',
                1: 'WaitingForUser',
                2: 'WaitingForSupport',
                3: 'Resolved',
                4: 'Closed'
            };
            return statusMap[status] ?? 'Open';
        }
        return status;
    };

    const statusClassFor = (status: SupportTicketStatus) => {
        const normalized = statusLabelFor(status).toLowerCase();
        if (normalized.includes('wait') || normalized.includes('pending')) {
            return 'waiting';
        }
        if (normalized.includes('resolve') || normalized.includes('closed')) {
            return 'resolved';
        }
        return 'open';
    };

    const fetchTickets = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const data = await listSupportTickets();
            setTickets(data);
        } catch (error) {
            console.error('Failed to load support tickets', error);
            setLoadError('Unable to load requests right now.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTickets();
    }, [fetchTickets]);

    useEffect(() => {
        if (!toastMessage) {
            return;
        }
        const timeout = window.setTimeout(() => setToastMessage(null), 3000);
        return () => window.clearTimeout(timeout);
    }, [toastMessage]);

    return (
        <AccountShell title="Help" sectionLabel="Help">
            <div className="help-page">
                <section className="card help-support">
                    <div className="help-section-header">
                        <h2>My support requests</h2>
                        <button
                            type="button"
                            className="btn btn-primary help-action-btn"
                            onClick={() => setIsModalOpen(true)}
                        >
                            New request
                        </button>
                    </div>
                    <div className="help-requests-table">
                        <div className="help-requests-row help-requests-head">
                            <span>Request</span>
                            <span>Subject</span>
                            <span>Status</span>
                            <span>Updated</span>
                            <span />
                        </div>
                        {isLoading && <div className="help-requests-empty">Loading support requests...</div>}
                        {!isLoading && loadError && <div className="help-requests-empty">{loadError}</div>}
                        {!isLoading && !loadError && tickets.length === 0 && (
                            <div className="help-requests-empty">No support requests yet.</div>
                        )}
                        {!isLoading &&
                            !loadError &&
                            tickets.map((ticket) => (
                                <div className="help-requests-row" key={ticket.id}>
                                    <strong>{ticket.id.startsWith('#') ? ticket.id : `#${ticket.id}`}</strong>
                                    <span>{ticket.subject || ticket.category}</span>
                                    <span className={`help-status-pill ${statusClassFor(ticket.status)}`}>
                                        {statusLabelFor(ticket.status)}
                                    </span>
                                    <span className="help-muted">{formatRelativeTime(ticket.updatedAt)}</span>
                                    <button
                                        type="button"
                                        className="btn btn-outline help-view-btn"
                                        onClick={() => {
                                            setSelectedTicketId(ticket.id);
                                            setSelectedTicketSummary({
                                                id: ticket.id,
                                                publicId: ticket.publicId ?? ticket.id,
                                                subject: ticket.subject,
                                                category: ticket.category,
                                                status: statusLabelFor(ticket.status),
                                                updatedAt: ticket.updatedAt
                                            });
                                            setIsTicketModalOpen(true);
                                        }}
                                    >
                                        View
                                    </button>
                                </div>
                            ))}
                    </div>
                </section>

                <section className="card help-faq">
                    <div className="help-section-header">
                        <h2>FAQ</h2>
                    </div>
                    <div className="help-accordion">
                        {faqItems.map((item, index) => {
                            const isOpen = index === 0;

                            return (
                                <div
                                    key={item.question}
                                    className={`help-accordion-item${isOpen ? ' is-open' : ''}`}
                                >
                                    <button type="button" className="help-accordion-trigger">
                                        <span>{item.question}</span>
                                        <FontAwesomeIcon icon={faChevronDown} />
                                    </button>
                                    {isOpen && (
                                        <p className="help-accordion-content">{item.answer}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                <div className="help-info-grid">
                    <section className="card help-guides">
                        <h3>Guides &amp; policies</h3>
                        <ul>
                            {guideLinks.map((guide) => (
                                <li key={guide}>
                                    <span className="help-doc-icon" aria-hidden="true">
                                        <FontAwesomeIcon icon={faFileLines} />
                                    </span>
                                    <span>{guide}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="card help-status">
                        <h3>System status</h3>
                        <div className="help-status-indicator">
                            <span className="help-status-dot" aria-hidden="true" />
                            <span>All systems operational</span>
                        </div>
                        <div className="help-status-list">
                            {systemStatuses.map((system) => (
                                <div key={system.label} className="help-status-row">
                                    <span>{system.label}</span>
                                    <span className="help-system-tag">{system.status}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <section className="card help-cta">
                    <div className="help-cta-content">
                        <h3>Still need help?</h3>
                        <p>Our team answers 24/7. Average response time: 2-6 hours.</p>
                        <div className="help-cta-actions">
                            <button type="button" className="btn btn-primary help-action-btn">
                                Contact support
                            </button>
                            <button type="button" className="btn btn-outline help-secondary-btn">
                                Open live chat
                            </button>
                        </div>
                        <span className="help-cta-note">
                            Please include order ID or Support ID when possible.
                        </span>
                    </div>
                </section>
            </div>
            <NewSupportRequestModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmitted={async (ticket) => {
                    setTickets((prev) => [ticket, ...prev]);
                    setToastMessage('Request submitted');
                    await fetchTickets();
                }}
            />
            <TicketDetailsModal
                isOpen={isTicketModalOpen}
                ticketId={selectedTicketId}
                initialTicket={selectedTicketSummary}
                onClose={() => {
                    setIsTicketModalOpen(false);
                    setSelectedTicketId(null);
                    setSelectedTicketSummary(undefined);
                }}
            />
            {toastMessage && <div className="help-toast">{toastMessage}</div>}
        </AccountShell>
    );
};

export default AccountHelpPage;
