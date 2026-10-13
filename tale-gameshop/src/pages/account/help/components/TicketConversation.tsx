import { useTranslation } from 'react-i18next';
import React from 'react';
import type { SupportMessage } from '../../../../types/support';
import MessageBubble from './MessageBubble';
import './ticket-details-modal.css';

interface TicketConversationProps {
    messages: SupportMessage[];
    formatRelativeTime: (value: string) => string;
}

const TicketConversation: React.FC<TicketConversationProps> = ({ messages, formatRelativeTime }) => {
    const { t } = useTranslation();
    return (
        <div className="ticket-conversation">
            <div className="ticket-conversation__header">
                <h3>{t('common.conversation')}</h3>
                <span>{t('common.timeline')}</span>
            </div>
            <div className="ticket-conversation__timeline">
                {messages.map((message) => (
                    <MessageBubble
                        key={message.id}
                        message={message}
                        isUser={message.authorType === 'User'}
                        timestamp={formatRelativeTime(message.createdAt)}
                    />
                ))}
            </div>
        </div>
    );
};

export default TicketConversation;
