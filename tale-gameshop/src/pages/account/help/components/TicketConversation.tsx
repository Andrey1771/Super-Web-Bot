import React from 'react';
import type { SupportMessage } from '../../../../types/support';
import MessageBubble from './MessageBubble';
import './ticket-details-modal.css';

interface TicketConversationProps {
    messages: SupportMessage[];
    formatRelativeTime: (value: string) => string;
}

const TicketConversation: React.FC<TicketConversationProps> = ({ messages, formatRelativeTime }) => {
    return (
        <div className="ticket-conversation">
            <div className="ticket-conversation__header">
                <h3>Conversation</h3>
                <span>Timeline:</span>
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
