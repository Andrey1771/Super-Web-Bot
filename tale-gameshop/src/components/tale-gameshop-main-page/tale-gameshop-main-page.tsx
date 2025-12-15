import React, {useEffect, useMemo, useState} from "react";
import './tale-gameshop-main-page.css'
import '../../font-awesome.ts';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faBolt,
    faChess,
    faCube,
    faDiceD20,
    faFileAlt,
    faGamepad,
    faLightbulb,
    faNewspaper,
    faPenNib,
    faPuzzlePiece,
    faSearch,
    faStar,
    faTag
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

    const placeholderImage = "https://via.placeholder.com/120x80/efefef/111111?text=Game";

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

    const featureCards = useMemo(() => ([
        {
            icon: faCube,
            title: "Intuitive and Easy-to-Navigate Interface",
            description: "Our user-friendly design ensures a seamless browsing experience."
        },
        {
            icon: faBolt,
            title: "Safe and Secure Payment Options",
            description: "Shop with confidence knowing your transactions are protected."
        },
        {
            icon: faStar,
            title: "Join Our Gaming Community Today",
            description: "Connect with fellow gamers and share your experiences."
        },
        {
            icon: faTag,
            title: "Exclusive Deals and Highlights",
            description: "Catch trending titles and limited offers curated for you."
        }
    ]), []);

    const categoryChips = [
        "Action", "Adventure", "Strategy", "Indie", "RPG", "Sports", "Co-op"
    ];

    const highlightItems = useMemo(() => ([
        {
            title: randomGame?.title || "Random Picks",
            description: "Check out our random game picks for you.",
            image: randomGame?.imagePath ? `${urlService.apiBaseUrl}/${randomGame.imagePath}` : placeholderImage,
            link: `/games?filterCategory=${latestGame?.title ?? ''}`
        },
        {
            title: latestGame?.title || "Latest Updates",
            description: "Get the latest updates on new releases.",
            image: latestGame?.imagePath ? `${urlService.apiBaseUrl}/${latestGame.imagePath}` : placeholderImage,
            link: `/games?filterCategory=${latestGame?.title ?? ''}`
        }
    ]), [latestGame, placeholderImage, randomGame, urlService.apiBaseUrl]);

    const trendingGames = useMemo(() => [
        randomGame,
        latestGame,
        randomGame && latestGame ? randomGame : null
    ].filter(Boolean) as Game[], [latestGame, randomGame]);

    return (
        <div className="main-page-down-header-padding">
            <section className="section-block bg-gray-100">
                <div className="tg-container grid gap-6 lg:grid-cols-3">
                    <div className="info-card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="section-title">Explore Our Games</h2>
                            <FontAwesomeIcon className="text-gray-500" icon={faGamepad}/>
                        </div>
                        <ul className="card-list">
                            <li className="card-list-item">
                                <FontAwesomeIcon className="fas text-xl mr-3 text-gray-700" icon={faGamepad}/>
                                <div>
                                    <h3 className="font-semibold">
                                        <Link to={`/games?filterCategory=Action`} className="text-gray-800 menu-item">
                                            Action Games
                                        </Link>
                                    </h3>
                                    <p className="text-gray-600">Discover thrilling action-packed adventures.</p>
                                </div>
                            </li>
                            <li className="card-list-item">
                                <FontAwesomeIcon className="fas text-xl mr-3 text-gray-700" icon={faPuzzlePiece}/>
                                <div>
                                    <h3 className="font-semibold">
                                        <Link to={`/games?filterCategory=Puzzle`} className="text-gray-800 menu-item">
                                            Puzzle Games
                                        </Link>
                                    </h3>
                                    <p className="text-gray-600">Challenge your mind with engaging puzzles.</p>
                                </div>
                            </li>
                            <li className="card-list-item">
                                <FontAwesomeIcon className="fas text-xl mr-3 text-gray-700" icon={faDiceD20}/>
                                <div>
                                    <h3 className="font-semibold">
                                        <Link to={`/games?filterCategory=Role-Playing Games (RPGs)`}
                                              className="text-gray-800 menu-item">
                                            RPG Games
                                        </Link>
                                    </h3>
                                    <p className="text-gray-600">Immerse yourself in epic role-playing adventures.</p>
                                </div>
                            </li>
                            <li className="card-list-item">
                                <FontAwesomeIcon className="fas text-xl mr-3 text-gray-700" icon={faChess}/>
                                <div>
                                    <h3 className="font-semibold">
                                        <Link to={`/games?filterCategory=Strategy`} className="text-gray-800 menu-item">
                                            Strategy Games
                                        </Link>
                                    </h3>
                                    <p className="text-gray-600">Plan and conquer with strategic gameplay.</p>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="info-card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="section-title">Latest Blog Posts</h2>
                            <FontAwesomeIcon className="text-gray-500" icon={faNewspaper}/>
                        </div>
                        <ul className="card-list">
                            <li className="card-list-item">
                                <FontAwesomeIcon className="fas text-xl mr-3 text-gray-700" icon={faPenNib}/>
                                <div>
                                    <h3 className="font-semibold">
                                        <Link to="/apologyPage" className="text-gray-800 menu-item">
                                            Game Reviews
                                        </Link>
                                    </h3>
                                    <p className="text-gray-600">Read our latest game reviews and insights.</p>
                                </div>
                            </li>
                            <li className="card-list-item">
                                <FontAwesomeIcon className="fas text-xl mr-3 text-gray-700" icon={faNewspaper}/>
                                <div>
                                    <h3 className="font-semibold">
                                        <Link to="/apologyPage" className="text-gray-800 menu-item">
                                            Gaming News
                                        </Link>
                                    </h3>
                                    <p className="text-gray-600">Stay updated with the latest gaming news.</p>
                                </div>
                            </li>
                            <li className="card-list-item">
                                <FontAwesomeIcon className="fas text-xl mr-3 text-gray-700" icon={faLightbulb}/>
                                <div>
                                    <h3 className="font-semibold">
                                        <Link to="/apologyPage" className="text-gray-800 menu-item">
                                            Tips &amp; Tricks
                                        </Link>
                                    </h3>
                                    <p className="text-gray-600">Enhance your gameplay with expert tips.</p>
                                </div>
                            </li>
                            <li className="card-list-item">
                                <FontAwesomeIcon className="fas text-xl mr-3 text-gray-700" icon={faFileAlt}/>
                                <div>
                                    <h3 className="font-semibold">
                                        <Link to="/apologyPage" className="text-gray-800 menu-item">
                                            Featured Articles
                                        </Link>
                                    </h3>
                                    <p className="text-gray-600">Explore our featured articles for insights.</p>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="info-card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="section-title">Highlights from Blog</h2>
                            <FontAwesomeIcon className="text-gray-500" icon={faStar}/>
                        </div>
                        <div className="space-y-4">
                            {highlightItems.map((item, idx) => (
                                <div className="highlight-card" key={idx}>
                                    <img
                                        alt={item.title}
                                        className="highlight-thumb"
                                        src={item.image}
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.src = placeholderImage;
                                        }}
                                    />
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-gray-900">{item.title}</h3>
                                        <p className="text-gray-600 text-sm mt-1 mb-2">{item.description}</p>
                                        <Link to={item.link} className="text-blue-500 font-semibold">Read more</Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex mt-6">
                            <Link to={`/games?filterCategory`}>
                                <button className="primary-btn flex items-center">
                                    Let's Go
                                    <i className="fas fa-chevron-right ml-2"></i>
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="section-block bg-black text-white">
                <div className="tg-container">
                    <div className="hero-grid">
                        <div className="text-section">
                            <h1 className="hero-title">Discover Your Next Favourite Computer Game</h1>
                            <p className="mt-4 text-gray-200">
                                Welcome to our gaming paradise, where you can explore a vast selection of computer games tailored to
                                your interests. Our mission is to connect gamers with the titles they love, making every gaming
                                experience unforgettable.
                            </p>
                            <div className="mt-6">
                                <div className="search-bar">
                                    <FontAwesomeIcon icon={faSearch} className="text-gray-500"/>
                                    <input className="search-input" placeholder="Search games, genres, or titles" type="text"/>
                                    <Link className="primary-btn" to={`/games?filterCategory`}>
                                        Search
                                    </Link>
                                </div>
                                <div className="chip-row">
                                    {categoryChips.map((chip) => (
                                        <Link key={chip} className="chip" to={`/games?filterCategory=${chip}`}>
                                            {chip}
                                        </Link>
                                    ))}
                                </div>
                                <div className="btn-row">
                                    <Link to={`/games?filterCategory`} className="primary-btn">Shop</Link>
                                    <Link to="/about" className="ghost-btn">Learn More</Link>
                                </div>
                            </div>
                        </div>
                        <div className="trending-grid">
                            {trendingGames.map((game, idx) => (
                                <div className="trend-card" key={idx}>
                                    <img
                                        alt={game.title}
                                        className="trend-thumb"
                                        src={`${urlService.apiBaseUrl}/${game.imagePath}`}
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.src = placeholderImage;
                                        }}
                                    />
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-400">{idx === 0 ? "Trending" : idx === 1 ? "Featured" : "New"}</p>
                                        <h3 className="font-semibold text-white mt-1">{game.title}</h3>
                                        <p className="text-gray-300 text-sm">{game.price ? `$${game.price}` : "Special price"}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="section-block">
                <div className="tg-container welcome-grid">
                    <div className="welcome-text">
                        <h1 className="text-3xl font-bold glow-text">
                            Welcome to the future of gaming: where passion meets innovation.
                        </h1>
                        <p className="mt-4 glow-text above-iframe-text-label text-gray-700">
                            At our core, we strive to revolutionise the gaming experience by providing an extensive
                            catalogue of titles that cater to every player's taste. Our vision is to create a vibrant community where
                            gamers can discover, connect, and thrive.
                        </p>
                    </div>
                    <div className="video-card">
                        <Iframe url="https://www.youtube.com/embed/kNAoc6acHH8?si=LB96pJk1Aj3tNc3t"
                                width="100%"
                                height="100%"
                                display="block"
                                position="relative"/>
                    </div>
                </div>
            </section>

            <section className="section-block">
                <div className="tg-container text-center">
                    <h2 className="text-sm uppercase tracking-wider text-gray-500">Explore</h2>
                    <h1 className="text-4xl font-bold mt-2">Discover Your Next Favourite Game</h1>
                    <p className="text-lg mt-4 max-w-2xl mx-auto text-gray-700">
                        With a vast library of titles, we cater to every gaming preference. Dive into our extensive collection and
                        find your perfect match.
                    </p>
                    <div className="feature-grid">
                        {featureCards.map((feature, index) => (
                            <div className="feature-card" key={index}>
                                <FontAwesomeIcon className="fas text-3xl text-gray-700" icon={feature.icon}/>
                                <h3 className="text-xl font-bold mt-4">{feature.title}</h3>
                                <p className="mt-2 text-gray-600">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-10 flex flex-wrap justify-center gap-3">
                        <Link to="/about" className="ghost-btn">Learn More</Link>
                        {!keycloak.authenticated &&
                            <a className="primary-btn" onClick={register}>Sign Up<i className="fas fa-arrow-right ml-2"></i></a>
                        }
                    </div>
                    <div className="testimonial">
                        <div className="flex justify-center">
                            <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                            <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                            <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                            <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                            <FontAwesomeIcon className="fas text-2xl text-yellow-500" icon={faStar}/>
                        </div>
                        <p className="text-xl font-semibold mt-4 text-gray-800">
                            "The service provided exceeded my expectations, and the selection of games is fantastic! I highly
                            recommend them to any gaming enthusiast."
                        </p>
                        <div className="flex items-center justify-center mt-6">
                            <img alt="Profile picture of John Doe" className="rounded-full" height="50"
                                 src="https://storage.googleapis.com/a1aa/image/eNdfm3dg3usfeSvmgxUlX7qSa3fYTqZgqV4G1VRcqiSlfAm6E.jpg"
                                 width="50"/>
                            <div className="ml-4 text-left">
                                <p className="font-bold text-gray-800">John Doe</p>
                                <p className="text-gray-600">Game Reviewer, Tech Magazine</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="section-block">
                <div className="tg-container newsletter">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Stay in the loop</h2>
                        <p className="text-gray-600 mt-2">Subscribe to our newsletter for updates, offers, and fresh picks.</p>
                    </div>
                    <form className="newsletter-form">
                        <input className="newsletter-input" placeholder="Enter your email" type="email"/>
                        <button className="primary-btn" type="button">Subscribe</button>
                    </form>
                </div>
            </section>
        </div>
    );
}