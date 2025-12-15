import React from "react";
import './tale-gameshop-main-page.css';
import '../../font-awesome.ts';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faGamepad,
    faPuzzlePiece,
    faDiceD20,
    faChess,
    faCube,
    faShieldAlt,
    faComments
} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import {useKeycloak} from "@react-keycloak/web";
import container from "../../inversify.config";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../constants/identifiers";

const categories = [
    {
        title: 'Экшен',
        description: 'Динамичные сражения и яркие спецэффекты.',
        icon: faGamepad,
        link: '/games?filterCategory=Action'
    },
    {
        title: 'Головоломки',
        description: 'Игры для тех, кто любит думать на пару ходов вперёд.',
        icon: faPuzzlePiece,
        link: '/games?filterCategory=Puzzle'
    },
    {
        title: 'RPG',
        description: 'Сюжетные приключения с глубокой прокачкой персонажа.',
        icon: faDiceD20,
        link: '/games?filterCategory=Role-Playing Games (RPGs)'
    },
    {
        title: 'Стратегии',
        description: 'Планируйте, стройте и побеждайте в своём темпе.',
        icon: faChess,
        link: '/games?filterCategory=Strategy'
    }
];

const benefits = [
    {
        title: 'Единый вход',
        description: 'Безопасная авторизация через Keycloak с ролями и правами.',
        icon: faShieldAlt
    },
    {
        title: 'Работа с ботом',
        description: 'Интеграция с Telegram-ботом для уведомлений и поддержки.',
        icon: faComments
    },
    {
        title: 'Удобный каталог',
        description: 'Фильтры по категориям, корзина и быстрый чек-аут.',
        icon: faCube
    }
];

export default function TaleGameshopMainPage() {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    const register = async () => {
        await keycloakAuthService.registerWithRedirect(keycloak, window.location.href);
    };

    return (
        <div className="main-page-down-header-padding bg-gray-50">
            <section className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-20 px-4">
                <div className="container mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                    <div className="space-y-6">
                        <p className="uppercase tracking-wide text-sm font-semibold opacity-80">TALESHOP</p>
                        <h1 className="text-4xl md:text-5xl font-bold leading-tight">
                            Магазин игр с защитой Keycloak и умным Telegram-ботом
                        </h1>
                        <p className="text-lg text-white/80 max-w-2xl">
                            Каталог, покупки и админ-панель в одном месте. Безопасный вход, понятная структура и никакой
                            демо-кривизны.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Link
                                to={`/games?filterCategory`}
                                className="px-6 py-3 bg-white text-indigo-700 font-semibold rounded-lg shadow-md hover:shadow-lg transition"
                            >
                                Каталог
                            </Link>
                            <Link
                                to="/about"
                                className="px-6 py-3 border border-white/70 text-white font-semibold rounded-lg hover:bg-white/10 transition"
                            >
                                О сервисе
                            </Link>
                            {!keycloak.authenticated && (
                                <button
                                    className="px-6 py-3 bg-black/30 border border-white/40 text-white font-semibold rounded-lg hover:bg-black/40 transition"
                                    onClick={register}
                                >
                                    Зарегистрироваться
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
                        <h2 className="text-xl font-semibold mb-4">Что вас ждёт</h2>
                        <ul className="space-y-4 text-white/90">
                            <li className="flex items-start gap-3">
                                <FontAwesomeIcon icon={faShieldAlt} className="text-2xl" />
                                <div>
                                    <p className="font-semibold">Авторизация и роли</p>
                                    <p className="text-sm">Keycloak управляет правами пользователей и доступом в админку.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <FontAwesomeIcon icon={faComments} className="text-2xl" />
                                <div>
                                    <p className="font-semibold">Телеграм-бот</p>
                                    <p className="text-sm">Уведомления, сообщения и обслуживание клиентов в мессенджере.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <FontAwesomeIcon icon={faCube} className="text-2xl" />
                                <div>
                                    <p className="font-semibold">Чистый фронтенд</p>
                                    <p className="text-sm">Аккуратные карточки, ровные отступы и единый стиль кнопок.</p>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="container mx-auto py-16 px-4">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-sm uppercase tracking-wider text-gray-500">Категории</h2>
                        <h3 className="text-3xl font-bold">Подберите игру по настроению</h3>
                    </div>
                    <Link to="/games" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                        Перейти в каталог
                    </Link>
                </div>
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                    {categories.map((category) => (
                        <Link
                            to={category.link}
                            key={category.title}
                            className="flex flex-col h-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition"
                        >
                            <div className="flex items-center justify-between">
                                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-2xl">
                                    <FontAwesomeIcon icon={category.icon}/>
                                </div>
                            </div>
                            <h4 className="text-xl font-semibold mt-4 mb-2">{category.title}</h4>
                            <p className="text-gray-600 text-sm">{category.description}</p>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="bg-white border-y border-gray-200 py-16 px-4">
                <div className="container mx-auto text-center">
                    <h2 className="text-sm uppercase tracking-wider text-gray-500">Почему TaleShop</h2>
                    <h3 className="text-3xl font-bold mt-2">Выгодный сервис без лишнего шума</h3>
                    <p className="text-lg text-gray-600 mt-3 max-w-3xl mx-auto">
                        Собрали только самые нужные блоки для демо: чистый экран, удобные кнопки и понятная структура. Всё остальное
                        — в каталоге и админ-панели.
                    </p>
                    <div className="grid gap-6 md:grid-cols-3 mt-10">
                        {benefits.map((benefit) => (
                            <div
                                key={benefit.title}
                                className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-left shadow-sm h-full"
                            >
                                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-2xl mb-4">
                                    <FontAwesomeIcon icon={benefit.icon}/>
                                </div>
                                <h4 className="text-xl font-semibold mb-2">{benefit.title}</h4>
                                <p className="text-gray-600 text-sm">{benefit.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
