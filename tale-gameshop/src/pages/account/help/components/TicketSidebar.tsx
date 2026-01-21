import React from 'react';
import {Link} from 'react-router-dom';
import type { TicketDetails } from '../../../../types/support';
import StatusBadge from './StatusBadge';
import './ticket-details-modal.css';

interface TicketSidebarProps {
    ticket: TicketDetails;
    isWorking: boolean;
    onResolve: () => void;
    onClose: () => void;
    onDownload: () => void;
}

const TicketSidebar: React.FC<TicketSidebarProps> = ({ ticket, isWorking, onResolve, onClose, onDownload }) => {
    return (
        <aside className="ticket-sidebar">
            <div className="ticket-sidebar__card card">
                <div className="ticket-sidebar__title">
                    <h4>Details &amp; actions</h4>
                    <StatusBadge status={ticket.status} />
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
                    <span>Priority:</span>
                    <strong>{ticket.priority ?? 'Normal'}</strong>
                </div>
                <div className="ticket-sidebar__row">
                    <span>Assigned:</span>
                    <strong>{ticket.assignedTo ?? 'Support team'}</strong>
                </div>
            </div>

            <div className="ticket-sidebar__actions">
                <button type="button" className="btn btn-outline" onClick={onResolve} disabled={isWorking}>
                    Mark as resolved
                </button>
                <button type="button" className="btn btn-outline ticket-sidebar__danger" onClick={onClose} disabled={isWorking}>
                    Close request
                </button>
                <button type="button" className="btn btn-outline" onClick={onDownload} disabled={isWorking}>
                    Download transcript
                </button>
            </div>

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
