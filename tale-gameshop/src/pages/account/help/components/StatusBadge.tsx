import React from 'react';
import type { TicketStatus } from '../../../../types/support';
import './ticket-details-modal.css';

interface StatusBadgeProps {
    status: TicketStatus;
}

const statusLabelMap: Record<TicketStatus, string> = {
    Open: 'Open',
    WaitingForUser: 'Reply needed',
    WaitingForSupport: 'In review',
    Resolved: 'Resolved',
    Closed: 'Closed'
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
    return (
        <span className={`ticket-status-badge ticket-status-badge--${status.toLowerCase()}`}>
            {statusLabelMap[status]}
        </span>
    );
};

export default StatusBadge;
