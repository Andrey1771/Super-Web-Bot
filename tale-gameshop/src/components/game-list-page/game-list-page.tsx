import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import IDENTIFIERS from "../../constants/identifiers";
import './game-list-page.css';
import container from "../../inversify.config";
import { Game } from "../../models/game";
import type { IGameService } from "../../iterfaces/i-game-service";
import type { ISettingsService } from "../../iterfaces/i-settings-service";
import {Settings} from "../../models/settings";
import GameCard from "../game-card/game-card";

const TaleGameshopGameList: React.FC = () => {
    const [games, setGames] = useState<Game[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const _gameService = container.get<IGameService>(IDENTIFIERS.IGameService);
    const _settingsService = container.get<ISettingsService>(IDENTIFIERS.ISettingsService);

    const filterCategory = searchParams.get("filterCategory") ?? "";
    const filterName = searchParams.get("filterName") ?? "";

    useEffect(() => {
        (async () => {
            const allSettings = await _settingsService.getAllSettings();
            const settings = allSettings.shift() ?? null;
            setSettings(settings);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            const fetchedGames = await _gameService.getAllGames();
            setGames(fetchedGames);
        })();
    }, []);

    const categories = useMemo(() => {
        const titles = games
            .map((game) => settings?.gameCategories[game.gameType]?.title)
            .filter((title): title is string => Boolean(title));
        return Array.from(new Set(titles));
    }, [games, settings]);

    const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        searchParams.set('filterCategory', value);
        setSearchParams(searchParams);
        navigate(`?${searchParams.toString()}`, { replace: true });
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        searchParams.set('filterName', value);
        setSearchParams(searchParams);
        navigate(`?${searchParams.toString()}`, { replace: true });
    };

    const filteredGames = games.filter((game) => {
        const categoryTitle = settings?.gameCategories[game.gameType]?.title ?? '';
        const matchesCategory = filterCategory ? categoryTitle === filterCategory : true;
        const matchesName = game.title.toLowerCase().includes(filterName.toLowerCase());
        return matchesCategory && matchesName;
    });

    return (
        <div className="container">
            <div className="card game-list-card">
                <h1 className="section-title">Game Store</h1>
                <p className="section-subtitle">Browse the full Tale Shop catalog with quick filters.</p>

                <div className="game-list-filters">
                    <input
                        type="text"
                        className="input"
                        placeholder="Search games"
                        value={filterName}
                        onChange={handleSearchChange}
                    />
                    <select
                        className="input"
                        value={filterCategory}
                        onChange={handleCategoryChange}
                    >
                        <option value="">All categories</option>
                        {categories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                </div>

                <div className="game-grid">
                    {filteredGames.map((game) => (
                        <GameCard
                            key={game.id}
                            game={game}
                            categoryTitle={settings?.gameCategories[game.gameType]?.title}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TaleGameshopGameList;
