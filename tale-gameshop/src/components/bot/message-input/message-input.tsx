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
                className="input flex-grow"
            />
            <button
                type="submit"
                className="btn btn-primary ml-2"
            >
                Send
            </button>
        </form>
    );
};

export default MessageInput;
