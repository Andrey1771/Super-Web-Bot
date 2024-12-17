import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import IDENTIFIERS from "../../constants/identifiers";
import './game-list-page.css';
import container from "../../inversify.config";
import { Game } from "../../models/game";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { ISettingsService } from "../../iterfaces/i-settings-service";
import GameCard from '../game-card/game-card';

const TaleGameshopGameList: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [visibleGamesCount, setVisibleGamesCount] = useState<number>(9);
    const [gamesByCategory, setGamesByCategory] = useState<Map<string, Game[]>>(new Map());
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    // Получаем зависимости через контейнер
    const _gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
    const _settingsService = container.get<ISettingsService>(IDENTIFIERS.ISettingsService);

    const loadMoreStep = 9;

    useEffect(() => {
        loadGamesAndUpdateFilterCategory();
    }, []);

    useEffect(() => {
        loadGamesAndUpdateFilterCategory()
    }, [location.search]);

    const loadGamesAndUpdateFilterCategory = () => {
        const filterCategory = searchParams.get("filterCategory");
        setSearchQuery(filterCategory ?? "");

        // Загружаем игры при монтировании компонента
        const fetchGames = async () => {
            const fetchedGames = await _gameService.getAllGames();
            setGames(fetchedGames);
            await updateGamesByCategory(fetchedGames);
        };
        fetchGames();
    }

    // Обновление списка игр по категориям
    const updateGamesByCategory = async (gamesList: Game[]) => {
        const allSettings = await _settingsService.getAllSettings();
        const settings = allSettings.shift();

        const gamesByCategory = gamesList.reduce((acc, game) => {
            const category = settings?.gameCategories[game.gameType] ?? '';
            if (!acc.has(category)) {
                acc.set(category, []);
            }
            acc.get(category)!.push(game);
            return acc;
        }, new Map<string, Game[]>());

        setGamesByCategory(gamesByCategory);
    };

    useEffect(() => {
        // Фильтрация игр при изменении searchQuery или filterCategory
        updateGamesByCategory(games);
    }, [searchQuery]);

    // Обновление searchParams в URL
    const updateSearchParams = (value: string) => {
        searchParams.set('filterCategory', value);
        setSearchParams(searchParams);
        navigate(`?${searchParams.toString()}`, { replace: true });
    };

    // Обработчик изменения текста в инпуте
    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearchQuery(value);
        updateSearchParams(value); // Обновление параметра фильтрации в URL
    };

    // Обработчик изменения категории из выпадающего списка
    const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        setSearchQuery(value);
        updateSearchParams(value); // Обновление параметра фильтрации в URL
    };

    // Загрузка дополнительных игр
    const loadMoreGames = () => {
        setVisibleGamesCount(prevCount => prevCount + loadMoreStep);
    };

    // Функция очистки инпута
    const clearSearch = () => {
        setSearchQuery('');
        updateSearchParams(''); // Очистка фильтрации в URL
    };

    const filteredGamesByCategory = new Map(
        Array.from(gamesByCategory.entries()).filter(([category, games]) => {
            const categoryMatch = category.toLowerCase().includes(searchQuery.toLowerCase());
            const gamesMatch = games.some((game) =>
                game.title.toLowerCase().includes(searchQuery.toLowerCase())
            );
            return categoryMatch || gamesMatch;
        })
    );

    return (
        <div className="w-screen bg-gray-100">
            <main className="container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold text-center mb-4">Game List</h1>
                <p className="text-center text-gray-600 mb-8">
                    Browse our extensive collection of computer games, carefully curated to cater to every player's taste.
                </p>

                {/* Инпут для поиска */}
                <div className="relative mb-4">
                    <input
                        type="text"
                        className="border p-2 w-full pr-10" // pr-10 добавляем для крестика
                        placeholder="Search games..."
                        value={searchQuery}
                        onChange={handleSearchChange}
                    />
                    {searchQuery && (
                        <button
                            onClick={clearSearch}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600"
                        >
                            &times;
                        </button>
                    )}
                </div>

                {/* Выпадающий список для выбора категории */}
                <div className="mb-4">
                    <select
                        className="border p-2 w-full"
                        value={searchQuery}
                        onChange={handleCategoryChange}
                    >
                        <option value="">All Categories</option>
                        {Array.from(gamesByCategory.keys()).map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Отображаем игры по категориям */}
                {Array.from(filteredGamesByCategory.keys()).map((category) => (
                    <section key={category}>
                        <h2 className="text-2xl font-bold mb-4">{category}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                            {filteredGamesByCategory.get(category)
                                ?.slice(0, visibleGamesCount)
                                .map((game: Game) => (
                                    <GameCard key={game.id} game={game} />
                                ))}
                        </div>
                    </section>
                ))}

                {games.length > visibleGamesCount && (
                    <button
                        onClick={loadMoreGames}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mx-auto block"
                    >
                        Load More
                    </button>
                )}
            </main>
        </div>
    );
};

export default TaleGameshopGameList;
