import React from 'react';
import type { SupportMessage } from '../../../../types/support';
import AttachmentCard from './AttachmentCard';
import './ticket-details-modal.css';

interface MessageBubbleProps {
    message: SupportMessage;
    isUser: boolean;
    timestamp: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isUser, timestamp }) => {
    return (
        <div className={`ticket-message ${isUser ? 'ticket-message--user' : 'ticket-message--support'}`}>
            {!isUser && (
                <div className="ticket-message__avatar" aria-hidden="true">
                    <span>TS</span>
                </div>
            )}
            <div className="ticket-message__content">
                <div className="ticket-message__bubble">
                    {isUser ? (
                        <span className="ticket-message__author ticket-message__author--user">You</span>
                    ) : (
                        <span className="ticket-message__author">{message.authorName}</span>
                    )}
                    <p>{message.body}</p>
                    {message.attachments && message.attachments.length > 0 && (
                        <div className="ticket-message__attachments">
                            {message.attachments.map((attachment) => (
                                <AttachmentCard key={attachment.id} attachment={attachment} />
                            ))}
                        </div>
                    )}
                </div>
                <span className="ticket-message__time">{timestamp}</span>
            </div>
        </div>
    );
};

export default MessageBubble;
