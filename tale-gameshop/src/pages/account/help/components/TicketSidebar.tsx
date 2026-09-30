import { useTranslation } from 'react-i18next';
import React from 'react';
import {Link} from 'react-router-dom';
import type { TicketDetails } from '../../../../types/support';
import StatusBadge from './StatusBadge';
import './ticket-details-modal.css';

interface TicketSidebarProps {
    ticket: TicketDetails;
    isWorking: boolean;
    onResolve: () => void;
    onReopen: () => void;
}

const TicketSidebar: React.FC<TicketSidebarProps> = ({ ticket, isWorking, onResolve, onReopen }) => {
    const { t } = useTranslation();
    const isResolved = ticket.status === 'Resolved';
    const isClosed = ticket.status === 'Closed';

    return (
        <aside className="ticket-sidebar">
            <div className="ticket-sidebar__card card">
                <div className="ticket-sidebar__title">
                    <h4>{t('ticket.info')}</h4>
                </div>
                <div className="ticket-sidebar__row">
                    <span>{t('ticket.category')}</span>
                    <strong>{ticket.category}</strong>
                </div>
                <div className="ticket-sidebar__row">
                    <span>{t('ticket.order')}</span>
                    <strong>{ticket.order?.number ?? ticket.order?.id ?? '—'}</strong>
                </div>
                {ticket.order?.gameTitle && <span className="ticket-sidebar__sub">{ticket.order.gameTitle}</span>}
                <div className="ticket-sidebar__row">
                    <span>{t('ticket.email')}</span>
                    <strong>{ticket.email}</strong>
                </div>
                <div className="ticket-sidebar__row">
                    <span>{t('ticket.status')}</span>
                    <StatusBadge status={ticket.status} />
                </div>
            </div>

            {/* Контекстное действие: открытый тикет можно пометить решённым, решённый — переоткрыть.
                Closed — финальный статус поддержки, из него переоткрытия нет (только новый запрос). */}
            {!isClosed && (
                <button
                    type="button"
                    className="btn btn-primary ticket-sidebar__primary"
                    onClick={isResolved ? onReopen : onResolve}
                    disabled={isWorking}
                >
                    {isResolved ? t('ticket.reopenRequest') : t('ticket.problemSolved')}
                </button>
            )}

            <div className="ticket-sidebar__links">
                <h4>{t('ticket.helpfulLinks')}</h4>
                <div className="ticket-sidebar__pill-list">
                    <Link to="/support/refund-policy" className="ticket-sidebar__pill">{t('ticket.refundPolicy')}</Link>
                    <Link to="/support/payment-methods" className="ticket-sidebar__pill">{t('ticket.paymentMethods')}</Link>
                    <Link to="/support/key-delivery-guide" className="ticket-sidebar__pill">{t('ticket.keyDelivery')}</Link>
                </div>
            </div>
        </aside>
    );
};

export default TicketSidebar;
