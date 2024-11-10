import React from 'react';

interface MessageListProps {
    messages: { sender: string; text: string }[];
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => (
    <div className="flex-grow p-4 bg-gray-50 overflow-y-auto max-h-80">
        {messages.map((message, index) => (
            <div
                key={index}
                className={`p-2 mb-2 rounded-lg ${
                    message.sender === 'user'
                        ? 'bg-blue-500 text-white self-end text-right'
                        : 'bg-gray-300 text-black'
                }`}
            >
                <span>{message.text}</span>
            </div>
        ))}
    </div>
);

export default MessageList;