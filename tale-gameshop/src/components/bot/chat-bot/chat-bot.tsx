import React, { useState } from 'react';
import MessageInput from '../message-input/message-input';
import MessageList from '../message-list/message-list';
import './chat-bot.css'

const ChatBot: React.FC = () => {
    const [messages, setMessages] = useState<{ sender: string; text: string }[]>([
        { sender: 'bot', text: 'Привет! Чем могу помочь?' },
    ]);
    const [isOpen, setIsOpen] = useState(false); // Состояние для открытия/закрытия чата

    const handleUserMessage = (text: string) => {
        const userMessage = { sender: 'user', text };
        setMessages((prev) => [...prev, userMessage]);

        // Генерация ответа бота
        const response = BotResponse(text); // Можно заменить более сложной логикой
        setMessages((prev) => [...prev, { sender: 'bot', text: response }]);
    };

    const toggleChat = () => {
        setIsOpen(!isOpen); // Переключение состояния чата
    };

    return (
        <div>
            {/* Кнопка для открытия чата, всегда видимая */}
            {!isOpen && (
                <button
                    onClick={toggleChat}
                    className="fixed bottom-4 right-4 bg-blue-500 text-white p-3 rounded-full shadow-lg hover:bg-blue-600 transition duration-200"
                >
                    Чат
                </button>
            )}

            {/* Чат-окошко */}
            {isOpen && (
                <div className="fixed bottom-4 right-4 chat-width h-96 bg-white border border-gray-300 rounded-lg shadow-lg flex flex-col">
                    {/* Верхняя панель с текстом и крестиком */}
                    <div className="flex items-center justify-between bg-blue-500 text-white p-2 rounded-t-lg">
                        <span className="font-semibold">Чат-бот</span>
                        <button
                            onClick={toggleChat}
                            className="text-2xl text-white hover:text-gray-200"
                        >
                            × {/* Крестик */}
                        </button>
                    </div>

                    {/* Область с сообщениями */}
                    <MessageList messages={messages} />

                    {/* Ввод сообщений */}
                    <MessageInput onSendMessage={handleUserMessage} />
                </div>
            )}
        </div>
    );
};

const BotResponse = (userInput: string): string => {
    // Примитивная логика ответа бота
    if (userInput.toLowerCase().includes('привет')) {
        return 'Здравствуйте! Чем я могу помочь?';
    }
    return 'Интересный вопрос!';
};

export default ChatBot;