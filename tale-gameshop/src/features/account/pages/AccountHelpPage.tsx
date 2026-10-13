import { useTranslation } from 'react-i18next';
import React, {useCallback, useEffect, useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronDown, faFileLines} from '@fortawesome/free-solid-svg-icons';
import {Link} from 'react-router-dom';
import AccountShell from '../components/AccountShell';
import NewSupportRequestModal from '../components/NewSupportRequestModal';
import {listSupportTickets} from '../support/supportApi';
import type {SupportTicket, SupportTicketStatus} from '../support/types';
import TicketDetailsModal from '../../../pages/account/help/components/TicketDetailsModal';
import type {TicketSummary} from '../../../types/support';
import {FAQ_IDS, getFaqItems} from '../../../content/support/faq';
import {groupSupportDocs} from '../../../content/support/doc-groups';
import './account-help-page.css';

const AccountHelpPage: React.FC = () => {
    const { t } = useTranslation();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    // Кнопок, открывающих форму обращения, две (в шапке списка и в блоке «Still need help?»): фокус после закрытия
    // возвращается на ту, что нажали.
    const requestOpenerRef = React.useRef<HTMLButtonElement | null>(null);
    const openRequestModal = (event: React.MouseEvent<HTMLButtonElement>) => {
        requestOpenerRef.current = event.currentTarget;
        setIsModalOpen(true);
    };
    // Живой чат — общий виджет в углу сайта; он слушает это событие (так же открывает его страница /support).
    const openLiveChat = () => window.dispatchEvent(new Event("taleshop:open-support-chat"));
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [selectedTicketSummary, setSelectedTicketSummary] = useState<TicketSummary | undefined>();
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_IDS[0] ?? null);
    // Тексты — на языке сайта; собираем при рендере, чтобы смена языка не оставила английский.
    const faqItems = getFaqItems();
    const supportDocGroups = groupSupportDocs();

    const formatRelativeTime = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        const diffMs = Date.now() - date.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);
        if (diffMinutes < 1) {
            return t('common.justNowShort');
        }
        if (diffMinutes < 60) {
            return t('common.minAgo', { count: diffMinutes });
        }
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) {
            return t('common.hoursAgo', { count: diffHours });
        }
        const diffDays = Math.floor(diffHours / 24);
        return t('common.daysAgo', { count: diffDays });
    };

    // Человеческие подписи вместо сырых enum-имён (WaitingForUser и т.п.).
    const humanStatusLabels: Record<string, string> = {
        Open: t('account.help.statuses.Open'),
        WaitingForUser: t('account.help.statuses.WaitingForUser'),
        WaitingForSupport: t('account.help.statuses.WaitingForSupport'),
        Resolved: t('account.help.statuses.Resolved'),
        Closed: t('account.help.statuses.Closed')
    };

    const statusLabelFor = (status: SupportTicketStatus) => {
        let raw: string;
        if (typeof status === 'number') {
            const statusMap: Record<number, string> = {
                0: 'Open',
                1: 'WaitingForUser',
                2: 'WaitingForSupport',
                3: 'Resolved',
                4: 'Closed'
            };
            raw = statusMap[status] ?? 'Open';
        } else {
            raw = status;
        }
        return humanStatusLabels[raw] ?? raw;
    };

    const statusClassFor = (status: SupportTicketStatus) => {
        const normalized = statusLabelFor(status).toLowerCase();
        if (normalized.includes('reply') || normalized.includes('review') || normalized.includes('wait') || normalized.includes('pending')) {
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
            setLoadError(t('account.help.loadFailed'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTickets();
    }, [fetchTickets]);

    // Тихое обновление списка (статусы/ответы поддержки подтягиваются сами, без websocket).
    useEffect(() => {
        const interval = window.setInterval(async () => {
            try {
                const data = await listSupportTickets();
                setTickets(data);
            } catch {
                // тихий poll — ошибку не показываем, попробуем в следующий тик
            }
        }, 15000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!toastMessage) {
            return;
        }
        const timeout = window.setTimeout(() => setToastMessage(null), 3000);
        return () => window.clearTimeout(timeout);
    }, [toastMessage]);

    return (
        <AccountShell title={t('account.help.title')} sectionLabel={t('account.help.title')} actions={<></>}>
            <div className="help-page">
                <section className="card help-support">
                    <div className="help-section-header">
                        <h2>{t('account.help.myRequests')}</h2>
                        <button
                            type="button"
                            className="btn btn-primary help-action-btn"
                            onClick={openRequestModal}
                        >
                            {t('account.help.newRequest')}
                        </button>
                    </div>
                    <div className="help-requests-table">
                        <div className="help-requests-row help-requests-head">
                            <span>{t('account.help.request')}</span>
                            <span>{t('account.help.subject')}</span>
                            <span>{t('account.help.status')}</span>
                            <span>{t('account.help.updated')}</span>
                            <span />
                        </div>
                        {isLoading && <div className="help-requests-empty">{t('account.help.loading')}</div>}
                        {!isLoading && loadError && <div className="help-requests-empty">{loadError}</div>}
                        {!isLoading && !loadError && tickets.length === 0 && (
                            <div className="help-requests-empty">{t('account.help.none')}</div>
                        )}
                        {!isLoading &&
                            !loadError &&
                            tickets.map((ticket) => (
                                <div className="help-requests-row" key={ticket.id}>
                                    {/* Показываем человеку короткий публичный номер (TKT-00001), а не сырой Mongo-id. */}
                                    <strong>{`#${ticket.publicId ?? ticket.id}`}</strong>
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
                                        {t('common.view')}
                                    </button>
                                </div>
                            ))}
                    </div>
                </section>

                <section className="card help-faq">
                    <div className="help-section-header">
                        <h2>{t('account.help.faq')}</h2>
                    </div>
                    <div className="help-accordion">
                        {faqItems.map((item, index) => {
                            const isOpen = item.id === openFaqId;
                            const contentId = `${item.id}-content`;
                            const buttonId = `${item.id}-button`;

                            return (
                                <div
                                    key={item.id}
                                    className={`help-accordion-item${isOpen ? ' is-open' : ''}`}
                                >
                                    <button
                                        id={buttonId}
                                        type="button"
                                        className="help-accordion-trigger"
                                        aria-expanded={isOpen}
                                        aria-controls={contentId}
                                        onClick={() =>
                                            setOpenFaqId((prev) => (prev === item.id ? null : item.id))
                                        }
                                    >
                                        <span>{item.question}</span>
                                        <FontAwesomeIcon icon={faChevronDown} />
                                    </button>
                                    {isOpen && (
                                        <p
                                            id={contentId}
                                            className="help-accordion-content"
                                            role="region"
                                            aria-labelledby={buttonId}
                                        >
                                            {item.answer}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="card help-guides">
                    <h3>{t('account.help.guides')}</h3>
                    <div className="help-guides-grid">
                        {supportDocGroups.map((group) => (
                            <div className="help-guides-group" key={group.title}>
                                <h4>{group.title}</h4>
                                <ul>
                                    {group.docs.map((guide) => (
                                        <li key={guide.id}>
                                            <Link to={guide.route}>
                                                <FontAwesomeIcon icon={faFileLines} className="help-doc-icon" aria-hidden="true" />
                                                <span>{guide.title}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="card help-cta">
                    <div className="help-cta-content">
                        <h3>{t('account.help.stillNeed')}</h3>
                        <p>{t('account.help.team')}</p>
                        <div className="help-cta-actions">
                            <button type="button" className="btn btn-primary help-action-btn" onClick={openRequestModal}>
                                {t('common.contactSupport')}
                            </button>
                            <button type="button" className="btn btn-outline help-secondary-btn" onClick={openLiveChat}>
                                {t('account.help.openChat')}
                            </button>
                        </div>
                        <span className="help-cta-note">
                            {t('account.help.includeIds')}
                        </span>
                    </div>
                </section>
            </div>
            <NewSupportRequestModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                openerRef={requestOpenerRef}
                onSubmitted={async (ticket) => {
                    setTickets((prev) => [ticket, ...prev]);
                    setToastMessage(t('account.help.submitted'));
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
