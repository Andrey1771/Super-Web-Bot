import React, {useState, useEffect} from 'react';
import {useSearchParams, useNavigate, useLocation} from 'react-router-dom';
import IDENTIFIERS from "../../constants/identifiers";
import './game-list-page.css';
import container from "../../inversify.config";
import {Game} from "../../models/game";
import type {IGameService} from "../../iterfaces/i-game-service";
import type {ISettingsService} from "../../iterfaces/i-settings-service";
import GameListItem from "../game-list-item/game-list-item";
import {GameCategory, Settings} from "../../models/settings";

const defaultCategories: GameCategory[] = [
    {tag: 'action', title: 'Action'},
    {tag: 'adventure', title: 'Adventure'},
    {tag: 'rpg', title: 'RPG'},
    {tag: 'strategy', title: 'Strategy'},
    {tag: 'indie', title: 'Indie'},
    {tag: 'simulation', title: 'Simulation'}
];

const demoGames: Game[] = [
    {
        id: 'demo-1',
        name: 'Neon Odyssey',
        title: 'Neon Odyssey',
        description: 'Fast-paced cyber action across neon cities.',
        price: 29.99,
        gameType: 0,
        imagePath: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
        releaseDate: '2023-05-01'
    },
    {
        id: 'demo-2',
        name: 'Legends of Auria',
        title: 'Legends of Auria',
        description: 'Story-driven RPG with party quests and deep lore.',
        price: 39.99,
        gameType: 2,
        imagePath: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
        releaseDate: '2023-10-15'
    },
    {
        id: 'demo-3',
        name: 'Skyforge Tactics',
        title: 'Skyforge Tactics',
        description: 'Strategic battles on floating islands.',
        price: 24.99,
        gameType: 3,
        imagePath: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?auto=format&fit=crop&w=800&q=80',
        releaseDate: '2022-11-11'
    },
    {
        id: 'demo-4',
        name: 'Puzzle Garden',
        title: 'Puzzle Garden',
        description: 'Relaxing indie riddles in a zen garden.',
        price: 14.99,
        gameType: 4,
        imagePath: 'https://images.unsplash.com/photo-1504274066651-8d31a536b11a?auto=format&fit=crop&w=800&q=80',
        releaseDate: '2021-04-20'
    },
    {
        id: 'demo-5',
        name: 'Starbound Routes',
        title: 'Starbound Routes',
        description: 'Adventure across galaxies with your crew.',
        price: 34.99,
        gameType: 1,
        imagePath: 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=800&q=80',
        releaseDate: '2022-02-02'
    },
    {
        id: 'demo-6',
        name: 'Sim Architect',
        title: 'Sim Architect',
        description: 'Build, manage and optimize futuristic cities.',
        price: 27.99,
        gameType: 5,
        imagePath: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
        releaseDate: '2023-01-18'
    }
];

const TaleGameshopGameList: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [gamesByCategory, setGamesByCategory] = useState<Map<string, Game[]>>(new Map());
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchNameQuery, setSearchNameQuery] = useState<string>('');
    const [settings, setSettings] = useState<Settings>({id: 'default', gameCategories: defaultCategories});
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    const _gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
    const _settingsService = container.get<ISettingsService>(IDENTIFIERS.ISettingsService);

    useEffect(() => {
        (async () => {
            try {
                const allSettings = await _settingsService.getAllSettings();
                const fetchedSettings = allSettings.shift();
                if (fetchedSettings) {
                    setSettings(fetchedSettings);
                }
            } catch (error) {
                console.warn('Falling back to default settings', error);
                setSettings({id: 'default', gameCategories: defaultCategories});
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            await loadGamesAndUpdateFilterCategory();
        })();
    }, [settings, location.search]);

    const loadGamesAndUpdateFilterCategory = async () => {
        const filterCategory = searchParams.get("filterCategory");
        const filterName = searchParams.get("filterName");
        setSearchQuery(filterCategory ?? "");
        setSearchNameQuery(filterName ?? "");

        try {
            const fetchedGames = await _gameService.getAllGames();
            if (fetchedGames && fetchedGames.length > 0) {
                setGames(fetchedGames);
                await updateGamesByCategory(fetchedGames);
                return;
            }
        } catch (error) {
            console.warn('Game API unavailable, using demo games', error);
        }

        setGames(demoGames);
        await updateGamesByCategory(demoGames);
    }

    // Обновление списка игр по категориям
    const updateGamesByCategory = async (gamesList: Game[]) => {
        const gamesByCategory = gamesList.reduce((acc, game) => {
            const category = settings?.gameCategories?.[game.gameType]?.title ?? 'Other';

            if (!acc.has(category)) {
                acc.set(category, []);
            }
            acc.get(category)!.push(game);
            return acc;
        }, new Map<string, Game[]>());

        setGamesByCategory(gamesByCategory);
    };

    const updateSearchNameParams = (value: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('filterName', value);
        setSearchParams(params);
        navigate(`?${params.toString()}`, {replace: true});
    };

    // Обновление searchParams в URL
    const updateSearchParams = (value: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('filterCategory', value);
        setSearchParams(params);
        navigate(`?${params.toString()}`, { replace: true });
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
        setSearchNameQuery('');
        updateSearchParams(''); // Очистка фильтрации в URL
        updateSearchNameParams('');
    };

    const filteredGamesByCategory = new Map(
        Array.from(gamesByCategory.entries()).filter(([category, games]) => {
            const categoryMatch = category.toLowerCase().includes(searchQuery.toLowerCase());
            return categoryMatch;
        }).map((value: [string, Game[]]) => {
            return [
                value.at(0),
                (value.at(1) as Game[]).filter(game => game.title.toLowerCase().includes(searchNameQuery.toLowerCase()))
            ];
        })
    );

    const categoryOptions = settings?.gameCategories?.map((c) => c.title) ?? defaultCategories.map((c) => c.title);
    const hasResults = Array.from(filteredGamesByCategory.values()).some((list) => list.length > 0);

    return (
        <div className="bg-gray-100 min-h-screen">
            <main className="container mx-auto px-4 py-12">
                <h1 className="text-3xl font-bold text-center mb-4">Game Store</h1>
                <p className="text-center text-gray-600 mb-10 max-w-2xl mx-auto">
                    Browse our collection of computer games, curated for every play style.
                </p>

                <div className="filter-card space-y-4 mb-10">
                    {/* Инпут для поиска */}
                    <div className="relative">
                        <input
                            type="text"
                            className="border p-3 w-full pr-10 rounded-lg"
                            placeholder="Search games..."
                            value={searchNameQuery}
                            onChange={handleSearchChange}
                        />
                        {searchNameQuery && (
                            <button
                                onClick={clearSearch}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600"
                                aria-label="Clear search"
                            >
                                &times;
                            </button>
                        )}
                    </div>

                    {/* Выпадающий список для выбора категории */}
                    <div>
                        <select
                            className="border p-3 w-full rounded-lg"
                            value={searchQuery}
                            onChange={handleCategoryChange}
                        >
                            <option value="">All Categories</option>
                            {categoryOptions.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Отображаем игры по категориям */}
                {hasResults ? (
                    Array.from(filteredGamesByCategory.keys()).map((category) => (
                        <GameListItem
                            key={category}
                            filteredGamesByCategory={filteredGamesByCategory}
                            category={category}></GameListItem>
                    ))
                ) : (
                    <div className="empty-state">
                        <h3>No games found</h3>
                        <p>Try adjusting your filters or browsing all categories.</p>
                        <button onClick={clearSearch} className="reset-button">Reset filters</button>
                    </div>
                )}
            </main>
        </div>
    );
};

export default TaleGameshopGameList;
