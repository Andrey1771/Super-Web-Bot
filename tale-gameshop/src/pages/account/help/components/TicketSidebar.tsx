import React from 'react';
import {Link} from 'react-router-dom';
import type { TicketDetails } from '../../../../types/support';
import StatusBadge from './StatusBadge';
import './ticket-details-modal.css';

interface TicketSidebarProps {
    ticket: TicketDetails;
    isWorking: boolean;
    onResolve: () => void;
}

const TicketSidebar: React.FC<TicketSidebarProps> = ({ ticket, isWorking, onResolve }) => {
    return (
        <aside className="ticket-sidebar">
            <div className="ticket-sidebar__card card">
                <div className="ticket-sidebar__title">
                    <h4>Request information</h4>
                </div>
                <div className="ticket-sidebar__row">
                    <span>Category:</span>
                    <strong>{ticket.category}</strong>
                </div>
                <div className="ticket-sidebar__row">
                    <span>Order:</span>
                    <strong>{ticket.order?.number ?? ticket.order?.id ?? '—'}</strong>
                </div>
                {ticket.order?.gameTitle && <span className="ticket-sidebar__sub">{ticket.order.gameTitle}</span>}
                <div className="ticket-sidebar__row">
                    <span>Email:</span>
                    <strong>{ticket.email}</strong>
                </div>
                <div className="ticket-sidebar__row">
                    <span>Status:</span>
                    <StatusBadge status={ticket.status} />
                </div>
            </div>

            <button type="button" className="btn btn-primary ticket-sidebar__primary" onClick={onResolve} disabled={isWorking}>
                Reopen request
            </button>

            <div className="ticket-sidebar__links">
                <h4>Helpful links</h4>
                <div className="ticket-sidebar__pill-list">
                    <Link to="/support/refund-policy" className="ticket-sidebar__pill">Refund policy</Link>
                    <Link to="/support/payment-methods" className="ticket-sidebar__pill">Payment methods</Link>
                    <Link to="/support/key-delivery-guide" className="ticket-sidebar__pill">Key delivery guide</Link>
                </div>
            </div>
        </aside>
    );
};

export default TicketSidebar;
