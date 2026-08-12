import React from "react";
import { Link } from "react-router-dom";
import { Game } from "../../models/game";
import SafeGameImage from "../common/SafeGameImage";
import GameCoverOverlay from "../common/GameCoverOverlay";
import { slugify } from "../../utils/slugify";

// Универсальная «полка» главной страницы: ряд товарных карточек с заголовком и ссылкой
// «View all» в каталог с готовым фильтром. Все полки (New/Deals/Upcoming/Under $10)
// рисуются этим компонентом — различаются только набором игр, чипом на обложке
// и содержимым headerAside (например, таймер дилов).
export interface GameShelfProps {
    eyebrow: string;
    title: string;
    subtitle?: string;
    games: Game[];
    baseUrl: string;
    viewAllTo: string;
    /** Чип на обложке конкретной карточки (дата релиза, «Hot deal» и т.п.); null — без чипа. */
    coverChip?: (game: Game) => string | null;
    /** Правый верхний угол шапки — например, обратный отсчёт до конца скидок. */
    headerAside?: React.ReactNode;
    /** Класс-модификатор секции (фоновые вариации). */
    className?: string;
    /** Заглушка пустой полки. Без неё пустая полка не рисуется вовсе;
        с ней — секция видна всегда (для полок, которые должны «жить» на странице постоянно). */
    emptyState?: React.ReactNode;
}

export const gameHref = (game: Game) =>
    `/games/${game.slug ? slugify(game.slug) : slugify(game.title || game.name)}`;

export default function GameShelf({
    eyebrow,
    title,
    subtitle,
    games,
    baseUrl,
    viewAllTo,
    coverChip,
    headerAside,
    className,
    emptyState
}: GameShelfProps) {
    if (games.length === 0 && !emptyState) {
        return null;
    }

    return (
        <section className={`shelf-section reveal ${className ?? ""}`}>
            <div className="container">
                <div className="shelf-head">
                    <div className="section-heading">
                        <div className="heading-eyebrow">{eyebrow}</div>
                        <h2>{title}</h2>
                        {subtitle && <p className="muted">{subtitle}</p>}
                    </div>
                    <div className="shelf-head-side">
                        {headerAside}
                        <Link className="shelf-view-all" to={viewAllTo}>
                            View all →
                        </Link>
                    </div>
                </div>
                {games.length === 0 ? (
                    <div className="shelf-empty">{emptyState}</div>
                ) : (
                <div className="shelf-grid">
                    {games.map((game) => (
                        <Link className="shelf-card lift" key={game.id ?? game.title} to={gameHref(game)}>
                            <div className="shelf-cover">
                                <SafeGameImage
                                    gameTitle={game.title}
                                    src={game.imagePath}
                                    baseUrl={baseUrl}
                                    loading="lazy"
                                />
                                <GameCoverOverlay game={game} chip={coverChip?.(game) ?? null} />
                            </div>
                            <div className="shelf-body">
                                <div className="shelf-title">{game.title}</div>
                            </div>
                        </Link>
                    ))}
                </div>
                )}
            </div>
        </section>
    );
}
