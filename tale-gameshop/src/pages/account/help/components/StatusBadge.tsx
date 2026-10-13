import i18n from '../../../../i18n';
import React from 'react';
import type { TicketStatus } from '../../../../types/support';
import './ticket-details-modal.css';

interface StatusBadgeProps {
    status: TicketStatus;
}

// Подписи — в словаре account.help.statuses.<status>.

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
    return (
        <span className={`ticket-status-badge ticket-status-badge--${status.toLowerCase()}`}>
            {i18n.t('account.help.statuses.' + status)}
        </span>
    );
};

export default StatusBadge;
