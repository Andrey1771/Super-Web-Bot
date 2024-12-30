import React, { useState } from 'react';

interface MessageInputProps {
    onSendMessage: (text: string) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        onSendMessage(input);
        setInput('');
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex items-center border-t bg-white px-4 py-2"
        >
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Write a message..."
                className="flex-grow p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
                type="submit"
                className="chat-background-color  ml-2 px-4 py-2 animated-button text-white rounded-lg hover:bg-blue-600 focus:outline-none"
            >
                Send
            </button>
        </form>
    );
};

export default MessageInput;
