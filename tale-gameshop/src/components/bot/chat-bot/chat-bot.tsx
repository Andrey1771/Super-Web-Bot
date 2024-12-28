import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, {useEffect, useState } from 'react';
import MessageInput from '../message-input/message-input';
import MessageList from '../message-list/message-list';
import './chat-bot.css'
import { faGripLines } from '@fortawesome/free-solid-svg-icons';
import container from "../../../inversify.config";
import type {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";

const ChatBot: React.FC = () => {
    const [messages, setMessages] = useState<{ sender: string; text: string }[]>([
        { sender: 'bot', text: 'Привет! Опишите какой у вас вопрос?' },
    ]);
    const [isOpen, setIsOpen] = useState(false);
    const [hasResponded, setHasResponded] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [size, setSize] = useState({ width: 360, height: 480 });
    const [dragging, setDragging] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [startMousePosition, setStartMousePosition] = useState({ x: 0, y: 0 });
    const [initialSize, setInitialSize] = useState({ width: 360, height: 480 });
    const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });
    const [formData, setFormData] = useState({ name: '', email: '', phone: '' });


    const MIN_WIDTH = initialSize.width;
    const MIN_HEIGHT = initialSize.height;
    const MAX_WIDTH = window.innerWidth - 50;
    const MAX_HEIGHT = window.innerHeight - 50;

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent> | React.TouchEvent<HTMLDivElement>) => {
        if (resizing) return;
        setDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        setInitialPosition({ x: clientX - position.x, y: clientY - position.y });
        e.preventDefault();
    };

    const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        setResizing(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        setStartMousePosition({ x: clientX, y: clientY });
        setInitialSize(size);
        e.stopPropagation();
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (resizing) {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
            const dx = clientX - startMousePosition.x;
            const dy = clientY - startMousePosition.y;
            setSize((prevSize) => ({
                width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, initialSize.width + dx)),
                height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, initialSize.height + dy)),
            }));
        } else if (dragging) {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
            const dx = clientX - initialPosition.x;
            const dy = clientY - initialPosition.y;
            setPosition({ x: dx, y: dy });
        }
    };

    const handleMouseUp = () => {
        setDragging(false);
        setResizing(false);
    };

    useEffect(() => {
        const handleTouchMove = (e: TouchEvent) => handleMouseMove(e);
        const handleTouchEnd = () => handleMouseUp();

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleTouchMove);
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [dragging, resizing]);

    const handleUserMessage = (text: string) => {
        setMessages((prev) => [...prev, { sender: 'user', text }]);
        if (!hasResponded) {
            setMessages((prev) => [...prev, { sender: 'bot', text: 'Пожалуйста, заполните форму ниже, чтобы мы могли с вами связаться' }]);
            setHasResponded(true);
            setShowForm(true);
        }
    };

    const toggleChat = () => {
        setIsOpen(!isOpen);
    };

    const handleFormSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setShowForm(false);
        const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
        await apiClient.api.post(`https://localhost:7117/api/ChatBot`, {
            question: messages.at(messages.length - 2).text,
            email: formData.email,
            name: formData.name,
            phone: formData.phone
        });


        setMessages((prev) => [...prev, { sender: 'bot', text: 'Спасибо за предоставленные данные! В ближайшее время с вами свяжутся.' }]);
    };

    const handleFormChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormData((prevData) => ({ ...prevData, [name]: value }));
    };

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
                    style={{
                        top: position.y,
                        left: position.x,
                        width: size.width,
                        height: size.height,
                        minWidth: MIN_WIDTH,
                        minHeight: MIN_HEIGHT,
                    }}
                >
                    <div
                        className="flex items-center justify-between chat-background-color text-white p-2 rounded-t-lg cursor-move"
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleMouseDown}
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
                        <MessageList messages={messages} />

                        {showForm && (
                            <form onSubmit={handleFormSubmit} className="bg-gray-100 p-3 rounded mt-2">
                                <div className="mb-2">
                                    <label className="block text-sm font-medium">Имя</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleFormChange}
                                        required
                                        className="w-full p-2 border border-gray-300 rounded mt-1"
                                    />
                                </div>
                                <div className="mb-2">
                                    <label className="block text-sm font-medium">Электронная почта</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleFormChange}
                                        required
                                        className="w-full p-2 border border-gray-300 rounded mt-1"
                                    />
                                </div>
                                <div className="mb-2">
                                    <label className="block text-sm font-medium">Телефонный номер</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleFormChange}
                                        required
                                        className="w-full p-2 border border-gray-300 rounded mt-1"
                                    />
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

                    <MessageInput onSendMessage={handleUserMessage} />

                    <div
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center"
                        onMouseDown={handleResizeMouseDown}
                        onTouchStart={handleResizeMouseDown}
                    >
                        <FontAwesomeIcon icon={faGripLines} className="text-gray-400 -rotate-45" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatBot;