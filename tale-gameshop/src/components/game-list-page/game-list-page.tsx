import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import IDENTIFIERS from "../../constants/identifiers";
import './game-list-page.css';
import container from "../../inversify.config";
import { Game } from "../../models/game";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { ISettingsService } from "../../iterfaces/i-settings-service";
import GameListItem from "../game-list-item/game-list-item";
import {Settings} from "../../models/settings";

const TaleGameshopGameList: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [gamesByCategory, setGamesByCategory] = useState<Map<string, Game[]>>(new Map());
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchNameQuery, setSearchNameQuery] = useState<string>('');
    const [settings, setSettings] = useState<Settings | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    const _gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
    const _settingsService = container.get<ISettingsService>(IDENTIFIERS.ISettingsService);

    useEffect(() => {
        (async () => {
            const allSettings = await _settingsService.getAllSettings();
            const settings = allSettings.shift() ?? null;
            setSettings(settings);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            await loadGamesAndUpdateFilterCategory();
        })();
    }, [settings]);

    useEffect(() => {
        (async () => {
            await loadGamesAndUpdateFilterCategory();
        })();
    }, [location.search]);

    useEffect(() => {
        (async () => {
            // Фильтрация игр при изменении searchQuery или filterCategory
            await updateGamesByCategory(games);
        })();
    }, [searchQuery]);

    const loadGamesAndUpdateFilterCategory = async () => {
        const filterCategory = searchParams.get("filterCategory");
        setSearchQuery(filterCategory ?? "");

        // Загружаем игры при монтировании компонента
        const fetchGames = async () => {
            const fetchedGames = await _gameService.getAllGames();
            setGames(fetchedGames);
            await updateGamesByCategory(fetchedGames);
        };
        await fetchGames();
    }

    // Обновление списка игр по категориям
    const updateGamesByCategory = async (gamesList: Game[]) => {
        const gamesByCategory = gamesList.reduce((acc, game) => {
            const category = settings?.gameCategories[game.gameType] ?? null;
            if (category === null) {
                return acc
            };

            if (!acc.has(category.title)) {
                acc.set(category.title, []);
            }
            acc.get(category.title)!.push(game);
            return acc;
        }, new Map<string, Game[]>());

        setGamesByCategory(gamesByCategory);
    };

    const updateSearchNameParams = (value: string) => {
        searchParams.set('filterName', value);
        setSearchParams(searchParams);
        navigate(`?${searchParams.toString()}`, { replace: true });
    };

    // Обновление searchParams в URL
    const updateSearchParams = (value: string) => {
        searchParams.set('filterCategory', value);
        setSearchParams(searchParams);
        navigate(`?${searchParams.toString()}`, { replace: true });
    };

    // Обработчик изменения текста в инпуте
    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearchNameQuery(value);
        updateSearchNameParams(value); // Обновление параметра фильтрации в URL
    };

    // Обработчик изменения категории из выпадающего списка
    const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        setSearchQuery(value);
        updateSearchParams(value); // Обновление параметра фильтрации в URL
    };

    // Функция очистки инпута
    const clearSearch = () => {
        setSearchQuery('');
        updateSearchParams(''); // Очистка фильтрации в URL
    };

    const filteredGamesByCategory = new Map(
        Array.from(gamesByCategory.entries()).filter(([category, games]) => {
            const categoryMatch = category.toLowerCase().includes(searchQuery.toLowerCase());
            return categoryMatch;
        }).map((value: [string, Game[]]) => {
            return [value.at(0), (value.at(1) as Game[]).filter(game => game.title.includes(searchNameQuery))];
        })
    );

    return (
        <div className="bg-gray-100">
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
                        value={searchNameQuery}
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
                    <GameListItem
                        filteredGamesByCategory={filteredGamesByCategory}
                        category={category}></GameListItem>
                ))}
            </main>
        </div>
    );
};

export default TaleGameshopGameList;
