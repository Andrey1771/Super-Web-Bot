import React, {useEffect, useState} from "react";
import './tale-gameshop-main-page.css'
import '../../font-awesome.ts';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faChess, faCube,
    faDiceD20, faFileAlt,
    faGamepad,
    faLightbulb,
    faNewspaper,
    faPenNib,
    faPuzzlePiece, faStar
} from "@fortawesome/free-solid-svg-icons";
import Iframe from "react-iframe";
import container from "../../inversify.config";
import type {IApiClient} from "../../iterfaces/i-api-client";
import IDENTIFIERS from "../../constants/identifiers";
import {Game} from "../../models/game";
import {Link} from "react-router-dom";
import {useKeycloak} from "@react-keycloak/web";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import {IUrlService} from "../../iterfaces/i-url-service";

export default function TaleGameshopMainPage() {
    const [latestGame, setLatestGame] = useState<Game | null>(null);
    const [randomGame, setRandomGame] = useState<Game | null>(null);

    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    useEffect(() => {
        fetchLatestGame();
    }, []); // Пустой массив зависимостей, чтобы выполнить только один раз при монтировании

    const fetchLatestGame = async () => {
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get('/api/game');
            const items: Game[] = response.data;

            if (!items || items.length === 0) {
                throw new Error('No games found');
            }

            // Найти последнюю игру
            const latestGame = items.reduce((latest: Game | null, current) => {
                return !latest || new Date(current.releaseDate) > new Date(latest.releaseDate)
                    ? current
                    : latest;
            }, null);

            const randomGame = items[Math.floor(Math.random() * items.length)];

            setRandomGame(randomGame);
            setLatestGame(latestGame);
        } catch (err) {
            //setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            //setIsLoading(false);
        }
    };

    const register = async () => {
        try {
            await keycloakAuthService.registerWithRedirect(keycloak, window.location.href);
        } catch (error) {
            console.error('Ошибка инициализации приложения:', error);
        }
    }

    return (
        <div className="main-page-down-header-padding">
            <div className="bg-gray-100 py-10 pl-4 pr-4">
                <div className="container mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">

                    <div>
                        <h2 className="text-lg font-bold mb-4">
                            Explore Our Games
                        </h2>
                        <ul className="space-y-4">
                            <li className="flex items-start">
                                <FontAwesomeIcon className="fas text-xl mr-3" icon={faGamepad}/>
                                <div>
                                    <h3 className="font-bold">
                                        <Link to={`/games?filterCategory=Action`} className="text-gray-700 menu-item">
                                            Action Games
                                        </Link>
                                    </h3>
                                    <p>
                                        Discover thrilling action-packed adventures.
                                    </p>
                                </div>
                            </li>
                            <li className="flex items-start">
                                <FontAwesomeIcon className="fas text-xl mr-3" icon={faPuzzlePiece}/>
                                <div>
                                    <h3 className="font-bold">
                                        <Link to={`/games?filterCategory=Puzzle`} className="text-gray-700 menu-item">
                                            Puzzle Games
                                        </Link>
                                    </h3>
                                    <p>
                                        Challenge your mind with engaging puzzles.
                                    </p>
                                </div>
                            </li>
                            <li className="flex items-start">
                                <FontAwesomeIcon className="fas text-xl mr-3" icon={faDiceD20}/>
                                <div>
                                    <h3 className="font-bold">
                                        <Link to={`/games?filterCategory=Role-Playing Games (RPGs)`}
                                              className="text-gray-700 menu-item">
                                            RPG Games
                                        </Link>
                                    </h3>
                                    <p>
                                        Immerse yourself in epic role-playing adventures.
                                    </p>
                                </div>
                            </li>
                            <li className="flex items-start">
                                <FontAwesomeIcon className="fas text-xl mr-3" icon={faChess}/>
                                <div>
                                    <h3 className="font-bold">
                                        <Link to={`/games?filterCategory=Strategy`} className="text-gray-700 menu-item">
                                            Strategy Games
                                        </Link>
                                    </h3>
                                    <p>
                                        Plan and conquer with strategic gameplay.
                                    </p>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-lg font-bold mb-4">
                            Latest Blog Posts
                        </h2>
                        <ul className="space-y-4">
                            <li className="flex items-start">
                                <FontAwesomeIcon className="fas text-xl mr-3" icon={faPenNib}/>
                                <div>
                                    <h3 className="font-bold">
                                        <Link to="/apologyPage" className="text-gray-700 menu-item">
                                            Game Reviews
                                        </Link>
                                    </h3>
                                    <p>
                                        Read our latest game reviews and insights.
                                    </p>
                                </div>
                            </li>
                            <li className="flex items-start">
                                <FontAwesomeIcon className="fas text-xl mr-3" icon={faNewspaper}/>
                                <div>
                                    <h3 className="font-bold">
                                        <Link to="/apologyPage" className="text-gray-700 menu-item">
                                            Gaming News
                                        </Link>
                                    </h3>
                                    <p>
                                        Stay updated with the latest gaming news.
                                    </p>
                                </div>
                            </li>
                            <li className="flex items-start">
                                <FontAwesomeIcon className="fas text-xl mr-3" icon={faLightbulb}/>
                                <div>
                                    <h3 className="font-bold">
                                        <Link to="/apologyPage" className="text-gray-700 menu-item">
                                            Tips &amp; Tricks
                                        </Link>
                                    </h3>
                                    <p>
                                        Enhance your gameplay with expert tips.
                                    </p>
                                </div>
                            </li>
                            <li className="flex items-start">
                                <FontAwesomeIcon className="fas text-xl mr-3" icon={faFileAlt}/>
                                <div>
                                    <h3 className="font-bold">
                                        <Link to="/apologyPage" className="text-gray-700 menu-item">
                                            Featured Articles
                                        </Link>
                                    </h3>
                                    <p>
                                        Explore our featured articles for insights.
                                    </p>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="sm:col-span-2 md:col-span-1">
                        <h2 className="text-lg font-bold mb-4">
                            Highlights from Blog
                        </h2>
                        <div className="space-y-4">
                            <div className="bg-gray-200 p-4 flex items-center break-all">
                                <img alt={randomGame?.title} className="mr-4" height="50"
                                     src={`${urlService.apiBaseUrl}/${randomGame?.imagePath}`}
                                     width="50"/>
                                <div>
                                    <h3 className="font-bold">
                                        Random Picks
                                    </h3>
                                    <p>
                                        Check out our random game picks for you.
                                        <Link to={`/games?filterCategory=${latestGame?.title}`}
                                              className="text-blue-500">
                                            Read more
                                        </Link>
                                    </p>
                                </div>
                            </div>
                            <div className="bg-gray-200 p-4 flex items-center break-all">
                                <img alt={latestGame?.title} className="mr-4" height="50"
                                     src={`${urlService.apiBaseUrl}/${latestGame?.imagePath}`}
                                     width="50"/>
                                <div>
                                    <h3 className="font-bold">
                                        Latest Updates
                                    </h3>
                                    <p>
                                        Get the latest updates on new releases.
                                        <Link to={`/games?filterCategory=${latestGame?.title}`}
                                              className="text-blue-500">
                                            Read more
                                        </Link>
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex mt-4">
                            <Link to={`/games?filterCategory`}>
                                <button
                                    className="px-4 py-2 border border-gray-700 text-gray-700 flex items-center animated-button">
                                    Let's Go
                                    <i className="fas fa-chevron-right ml-2">
                                    </i>
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-black text-white py-20 pl-4 pr-4">
                <div className="container mx-auto text-center">
                    <h1 className="text-4xl font-bold mb-6">
                        Discover Your Next Favourite Computer Game
                    </h1>
                    <p className="mb-8">
                        Welcome to our gaming paradise, where you can explore a vast selection of computer games
                        tailored to
                        your interests. Our mission is to connect gamers with the titles they love, making every gaming
                        experience unforgettable.
                    </p>
                    <div className="flex justify-center space-x-4">
                        <Link to={`/games?filterCategory`} className="px-6 py-3 bg-white text-black animated-button">
                            Shop
                        </Link>
                        <Link to="/about" className="px-6 py-3 border border-white animated-button">
                            Learn More
                        </Link>
                    </div>
                </div>
            </div>

            <div className="container mx-auto flex items-start justify-start bg-white p-8 mb-28">
                <div className="flex items-start space-x-8 w-full">
                    <div className="w-1/2">
                        <h1 className="text-3xl font-bold glow-text">
                            Welcome to the future of gaming: where passion meets innovation.
                        </h1>
                        <p className="mt-4 glow-text above-iframe-text-label">
                            At our core, we strive to revolutionise the gaming experience by providing an extensive
                            catalogue of
                            titles that cater to every player's taste. Our vision is to create a vibrant community where
                            gamers
                            can discover, connect, and thrive.
                        </p>
                    </div>
                    <div className="w-1/2 bg-gray-200 flex items-center justify-center iframe-aspect">
                        {<Iframe url="https://www.youtube.com/embed/kNAoc6acHH8?si=LB96pJk1Aj3tNc3t"
                                width="100%"
                                height="100%"
                                display="block"
                                position="relative"/>}
                    </div>
                </div>
            </div>
            <div className="container mx-auto text-center py-16 pl-4 pr-4">
                <h2 className="text-sm uppercase tracking-wider text-gray-500">Explore</h2>
                <h1 className="text-4xl font-bold mt-2">Discover Your Next Favourite Game</h1>
                <p className="text-lg mt-4 max-w-2xl mx-auto">
                    With a vast library of titles, we cater to every gaming preference. Dive into our extensive
                    collection and
                    find your perfect match.
                </p>
                <div className="flex justify-center mt-12 space-x-8">
                    <div className="text-center">
                        <FontAwesomeIcon className="fas text-4xl text-gray-700" icon={faCube}/>
                        <h3 className="text-xl font-bold mt-4">Intuitive and Easy-to-Navigate Interface</h3>
                        <p className="mt-2 text-gray-600">Our user-friendly design ensures a seamless browsing
                            experience.</p>
                    </div>
                    <div className="text-center">
                        <FontAwesomeIcon className="fas text-4xl text-gray-700" icon={faCube}/>
                        <h3 className="text-xl font-bold mt-4">Safe and Secure Payment Options</h3>
                        <p className="mt-2 text-gray-600">Shop with confidence knowing your transactions are
                            protected.</p>
                    </div>
                    <div className="text-center">
                        <FontAwesomeIcon className="fas text-4xl text-gray-700" icon={faCube}/>
                        <h3 className="text-xl font-bold mt-4">Join Our Gaming Community Today</h3>
                        <p className="mt-2 text-gray-600">Connect with fellow gamers and share your experiences.</p>
                    </div>
                </div>
                <div className="mt-12">
                    <Link to="/about"
                        className="bg-transparent border border-gray-800 text-gray-800 py-2 px-6 rounded-full mr-4">Learn
                        More
                    </Link>
                    {!keycloak.authenticated &&
                        <a className="bg-transparent text-gray-800 py-2 px-6 rounded-full cursor-pointer"
                           onClick={register}>Sign Up<i
                            className="fas fa-arrow-right"></i></a>
                    }
                </div>
                <div className="mt-16">
                    <div className="flex justify-center">
                        <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                        <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                        <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                        <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                        <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                    </div>
                    <p className="text-xl font-semibold mt-4">
                        "The service provided exceeded my expectations, and the selection of games is fantastic! I
                        highly
                        recommend them to any gaming enthusiast."
                    </p>
                    <div className="flex items-center justify-center mt-6">
                        <img alt="Profile picture of John Doe" className="rounded-full" height="50"
                             src="https://storage.googleapis.com/a1aa/image/eNdfm3dg3usfeSvmgxUlX7qSa3fYTqZgqV4G1VRcqiSlfAm6E.jpg"
                             width="50"/>
                        <div className="ml-4 text-left">
                            <p className="font-bold">John Doe</p>
                            <p className="text-gray-600">Game Reviewer, Tech Magazine</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}