import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import IDENTIFIERS from "../../constants/identifiers";
import './game-list-page.css';
import container from "../../inversify.config";
import { Game } from "../../models/game";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { ISettingsService } from "../../iterfaces/i-settings-service";
import GameListItem from "../game-list-item/game-list-item";
import {Settings} from "../../models/settings";
import {DEMO_GAMES, DEMO_SETTINGS, DEFAULT_GAME_CATEGORIES} from "../../constants/demo-games";

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

    const resolvedSettings = useMemo(() => {
        if (settings?.gameCategories?.length) {
            return settings;
        }
        return DEMO_SETTINGS;
    }, [settings]);

    useEffect(() => {
        (async () => {
            try {
                const allSettings = await _settingsService.getAllSettings();
                const settingsFromApi = allSettings.shift() ?? null;
                setSettings(settingsFromApi ?? DEMO_SETTINGS);
            } catch (err) {
                setSettings(DEMO_SETTINGS);
            }
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
            await updateGamesByCategory(games);
        })();
    }, [searchQuery]);

    const loadGamesAndUpdateFilterCategory = async () => {
        const filterCategory = searchParams.get("filterCategory");
        const filterName = searchParams.get("filterName");
        setSearchQuery(filterCategory ?? "");
        setSearchNameQuery(filterName ?? "");

        try {
            const fetchedGames = await _gameService.getAllGames();
            const gamesToUse = fetchedGames && fetchedGames.length ? fetchedGames : DEMO_GAMES;
            setGames(gamesToUse);
            await updateGamesByCategory(gamesToUse);
        } catch (error) {
            setGames(DEMO_GAMES);
            await updateGamesByCategory(DEMO_GAMES);
        }
    }

    const updateGamesByCategory = async (gamesList: Game[]) => {
        const activeSettings = resolvedSettings?.gameCategories?.length ? resolvedSettings : {gameCategories: DEFAULT_GAME_CATEGORIES, id: 'default'};

        const gamesByCategory = gamesList.reduce((acc, game) => {
            const category = activeSettings.gameCategories[game.gameType] ?? null;
            const categoryTitle = category?.title ?? 'All Games';

            if (!acc.has(categoryTitle)) {
                acc.set(categoryTitle, []);
            }
            acc.get(categoryTitle)!.push(game);
            return acc;
        }, new Map<string, Game[]>());

        setGamesByCategory(gamesByCategory);
    };

    const updateSearchNameParams = (value: string) => {
        searchParams.set('filterName', value);
        setSearchParams(searchParams);
        navigate(`?${searchParams.toString()}`, { replace: true });
    };

    const updateSearchParams = (value: string) => {
        searchParams.set('filterCategory', value);
        setSearchParams(searchParams);
        navigate(`?${searchParams.toString()}`, { replace: true });
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearchNameQuery(value);
        updateSearchNameParams(value);
    };

    const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        setSearchQuery(value);
        updateSearchParams(value);
    };

    const clearSearch = () => {
        setSearchQuery('');
        updateSearchParams('');
    };

    const filteredGamesByCategory = new Map(
        Array.from(gamesByCategory.entries()).filter(([category]) => {
            const categoryMatch = category.toLowerCase().includes(searchQuery.toLowerCase());
            return categoryMatch;
        }).map((value: [string, Game[]]) => {
            return [value.at(0), (value.at(1) as Game[]).filter(game => game.title.toLowerCase().includes(searchNameQuery.toLowerCase()))];
        })
    );

    return (
        <div className="bg-gray-100 min-h-screen">
            <main className="container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold text-center mb-4">Game List</h1>
                <p className="text-center text-gray-600 mb-8">
                    Browse our extensive collection of computer games, carefully curated to cater to every player's taste.
                </p>

                <div className="relative mb-4">
                    <input
                        type="text"
                        className="border p-2 w-full pr-10"
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

                {Array.from(filteredGamesByCategory.keys()).map((category) => (
                    <GameListItem
                        key={category}
                        filteredGamesByCategory={filteredGamesByCategory}
                        category={category}></GameListItem>
                ))}
            </main>
        </div>
    );
};

export default TaleGameshopGameList;
