import React from 'react';
import {Link} from "react-router-dom";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faChartLine,
    faImages,
    faRobot,
    faBoxOpen,
    faUsers
} from "@fortawesome/free-solid-svg-icons";

const cards = [
    {
        title: 'Товары',
        description: 'Добавление, редактирование и удаление карточек игр.',
        icon: faBoxOpen,
        to: '/admin/cardAdder'
    },
    {
        title: 'Изображения',
        description: 'Управление обложками и медиабиблиотекой.',
        icon: faImages,
        to: '/admin/siteChanger'
    },
    {
        title: 'Telegram-бот',
        description: 'Сообщения, тексты и настройки интеграции.',
        icon: faRobot,
        to: '/admin/botChanger'
    },
    {
        title: 'Пользователи',
        description: 'Роли, доступы и ключевые данные аккаунтов.',
        icon: faUsers,
        to: '/admin/userInfo'
    },
    {
        title: 'Статистика',
        description: 'Графики и метрики по пользователям и продажам.',
        icon: faChartLine,
        to: '/admin/userStats'
    }
];

const menuItems = [
    {label: 'Dashboard', to: '/admin'},
    {label: 'Товары', to: '/admin/cardAdder'},
    {label: 'Пользователи', to: '/admin/userInfo'},
    {label: 'Статистика', to: '/admin/userStats'},
    {label: 'Настройки', to: '/admin/botChanger'}
];

const AdminPanelPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-100 py-10 px-4">
            <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
                <aside className="lg:w-64 bg-white rounded-2xl shadow-sm border border-gray-200 p-6 h-fit">
                    <h2 className="text-xl font-semibold mb-4">Админ-панель</h2>
                    <nav className="space-y-2 text-sm">
                        {menuItems.map((item) => (
                            <Link
                                key={item.to}
                                to={item.to}
                                className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 border border-transparent hover:border-gray-200"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </aside>
                <main className="flex-1">
                    <div className="mb-6 space-y-2">
                        <p className="text-xs uppercase tracking-wider text-gray-500">Главная / Админка</p>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                            <Link
                                to="/games"
                                className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 rounded-lg border border-indigo-100 hover:bg-indigo-100"
                            >
                                Назад в каталог
                            </Link>
                        </div>
                        <p className="text-gray-600 max-w-2xl">
                            Сводка всех инструментов для управления TaleShop: карточки товаров, изображения, бот и аналитика.
                        </p>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {cards.map((card) => (
                            <div
                                key={card.to}
                                className="h-full rounded-2xl bg-white border border-gray-200 shadow-sm p-6 flex flex-col justify-between"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl">
                                        <FontAwesomeIcon icon={card.icon}/>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-gray-900">{card.title}</h3>
                                        <p className="text-gray-600 text-sm mt-2">{card.description}</p>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <Link
                                        to={card.to}
                                        className="inline-flex items-center justify-center w-full px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                                    >
                                        Открыть
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AdminPanelPage;
