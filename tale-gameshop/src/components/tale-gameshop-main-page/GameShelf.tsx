import React from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faDesktop } from "@fortawesome/free-solid-svg-icons";
import { faApple, faLinux, faPlaystation, faXbox } from "@fortawesome/free-brands-svg-icons";
import { Game } from "../../models/game";
import SafeGameImage from "../common/SafeGameImage";
import { slugify } from "../../utils/slugify";

// Иконки платформ в ценовой полосе карточки — покупатель сразу видит, для чего ключ.
// Неизвестный ярлык просто не рисуется (лучше без иконки, чем с чужой).
const platformIcons: Record<string, IconDefinition> = {
    PC: faDesktop,
    Mac: faApple,
    Linux: faLinux,
    PlayStation: faPlaystation,
    Xbox: faXbox
};

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

const finalPriceOf = (game: Game): number => {
    const regular = Number.isFinite(game.price) ? Number(game.price) : 0;
    return Number.isFinite(game.finalPrice ?? NaN) ? Number(game.finalPrice) : regular;
};

const hasVisibleDiscount = (game: Game): boolean =>
    Boolean(game.discountActive && game.discountPercent && game.discountPercent > 0 &&
        finalPriceOf(game) < Number(game.price));

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
                    {games.map((game) => {
                        const chip = coverChip?.(game) ?? null;
                        const discounted = hasVisibleDiscount(game);
                        return (
                            <Link className="shelf-card lift" key={game.id ?? game.title} to={gameHref(game)}>
                                <div className="shelf-cover">
                                    <SafeGameImage
                                        gameTitle={game.title}
                                        src={game.imagePath}
                                        baseUrl={baseUrl}
                                        loading="lazy"
                                    />
                                    {chip && <span className="shelf-chip">{chip}</span>}
                                    {discounted && (
                                        <span className="shelf-discount-badge">
                                            −{Number(game.discountPercent).toFixed(0)}%
                                        </span>
                                    )}
                                    {/* Цена лежит поверх обложки (референс — витрины конкурентов),
                                        под ней — затемняющий градиент, чтобы читалась на любом арте.
                                        Слева — платформы ключа, справа — цена. */}
                                    <span className="shelf-price-strip">
                                        <span className="shelf-platforms">
                                            {(game.platforms ?? [])
                                                .filter((platform) => platformIcons[platform])
                                                .map((platform) => (
                                                    <FontAwesomeIcon
                                                        key={platform}
                                                        icon={platformIcons[platform]}
                                                        title={platform}
                                                    />
                                                ))}
                                        </span>
                                        <span className="shelf-price-group">
                                            {discounted && (
                                                <span className="shelf-price-old">${Number(game.price).toFixed(2)}</span>
                                            )}
                                            <span className="shelf-price">${finalPriceOf(game).toFixed(2)}</span>
                                        </span>
                                    </span>
                                </div>
                                <div className="shelf-body">
                                    <div className="shelf-title">{game.title}</div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
                )}
            </div>
        </section>
    );
}
