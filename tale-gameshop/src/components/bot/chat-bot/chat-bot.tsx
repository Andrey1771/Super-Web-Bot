import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, {useEffect, useState } from 'react';
import MessageInput from '../message-input/message-input';
import MessageList from '../message-list/message-list';
import './chat-bot.css'
import { faGripLines } from '@fortawesome/free-solid-svg-icons';

const ChatBot: React.FC = () => {
    const [messages, setMessages] = useState<{ sender: string; text: string }[]>([
        { sender: 'bot', text: 'Привет! Чем могу помочь?' },
    ]);
    const [isOpen, setIsOpen] = useState(false);
    const [hasResponded, setHasResponded] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [size, setSize] = useState({ width: 360, height: 480 });
    const [dragging, setDragging] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState('');
    const [startMousePosition, setStartMousePosition] = useState({ x: 0, y: 0 });
    const [initialSize, setInitialSize] = useState({ width: 360, height: 480 });
    const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });

    const MIN_WIDTH = initialSize.width;
    const MIN_HEIGHT = initialSize.height;
    const MAX_WIDTH = window.innerWidth - 50;
    const MAX_HEIGHT = window.innerHeight - 50;

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        if (resizing) return;
        setDragging(true);
        setInitialPosition({ x: e.clientX - position.x, y: e.clientY - position.y });
        e.preventDefault();
    };

    const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>, direction: string) => {
        setResizing(true);
        setResizeDirection(direction);
        setStartMousePosition({ x: e.clientX, y: e.clientY });
        setInitialSize(size);
        e.stopPropagation();
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (resizing) {
            const dx = e.clientX - startMousePosition.x;
            const dy = e.clientY - startMousePosition.y;

            setSize((prevSize) => ({
                width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, initialSize.width + dx)),
                height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, initialSize.height + dy)),
            }));
        } else if (dragging) {
            const dx = e.clientX - initialPosition.x;
            const dy = e.clientY - initialPosition.y;
            setPosition({ x: dx, y: dy });
        }
    };

    const handleMouseUp = () => {
        setDragging(false);
        setResizing(false);
    };

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, resizing]);

    const handleUserMessage = (text: string) => {
        setMessages((prev) => [...prev, { sender: 'user', text }]);
        if (!hasResponded) {
            setMessages((prev) => [...prev, { sender: 'bot', text: 'Вам скоро ответят' }]);
            setHasResponded(true);
            setShowForm(true);
        }
    };

    const toggleChat = () => {
        setIsOpen(!isOpen);
    };

    const handleFormSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setShowForm(false);
        setMessages((prev) => [...prev, { sender: 'bot', text: 'Спасибо за предоставленные данные!' }]);
    };
//#8a2be2
    return (
        <div>
            {!isOpen && (
                <button
                    onClick={toggleChat}
                    className="fixed bottom-4 right-4 chat-background-color text-white p-3 rounded-full shadow-lg transition duration-200"
                >
                    Чат
                </button>
            )}

            {isOpen && (
                <div
                    className="fixed bg-white border border-gray-300 rounded-lg shadow-lg flex flex-col"
                    style={{top: position.y, left: position.x, width: size.width, height: size.height, minWidth: initialSize.width, minHeight: initialSize.height}}
                >
                    <div
                        className="flex items-center justify-between chat-background-color text-white p-2 rounded-t-lg cursor-move"
                        onMouseDown={handleMouseDown}
                    >
                        <span className="font-semibold">Чат-бот</span>
                        <button
                            onClick={toggleChat}
                            className="text-2xl text-white hover:text-gray-200"
                        >
                            ×
                        </button>
                    </div>

                    <div className="flex-grow overflow-y-auto p-2">
                        <MessageList messages={messages}/>

                        {showForm && (
                            <form onSubmit={handleFormSubmit} className="bg-gray-100 p-3 rounded mt-2">
                                <div className="mb-2">
                                    <label className="block text-sm font-medium">Имя</label>
                                    <input type="text" required
                                           className="w-full p-2 border border-gray-300 rounded mt-1"/>
                                </div>
                                <div className="mb-2">
                                    <label className="block text-sm font-medium">Электронная почта</label>
                                    <input type="email" required
                                           className="w-full p-2 border border-gray-300 rounded mt-1"/>
                                </div>
                                <div className="mb-2">
                                    <label className="block text-sm font-medium">Телефонный номер</label>
                                    <input type="tel" required
                                           className="w-full p-2 border border-gray-300 rounded mt-1"/>
                                </div>
                                <button
                                    type="submit"
                                    className="w-full chat-background-color animated-button text-white py-2 rounded hover:bg-blue-600 transition duration-200"
                                >
                                    Отправить
                                </button>
                            </form>
                        )}
                    </div>

                    <MessageInput onSendMessage={handleUserMessage}/>

                    <div
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center"
                        onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-right')}
                    >
                        {/* Иконка для ресайза */}
                        <FontAwesomeIcon icon={faGripLines} className="text-gray-400 -rotate-45"/>
                    </div>
                </div>
            )}
        </div>
    );
};
export default ChatBot;