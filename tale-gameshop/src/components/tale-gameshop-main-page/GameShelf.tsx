import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Game } from "../../models/game";
import Cover from "../common/Cover";
import GameCoverOverlay from "../common/GameCoverOverlay";
import HoverTrailer from "../common/HoverTrailer";
import { normalizeGameCoverUrl } from "../../utils/game-cover";
import { productHref } from "../../utils/software";
import "./game-shelf.css";

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
    /**
     * Подпись ссылки перехода в каталог. По умолчанию «View all», но полке лучше сказать,
     * куда именно ведёт: «All deals» полезнее, чем «всё» без уточнения — человек понимает,
     * что получит, ещё до нажатия.
     */
    viewAllLabel?: string;
    /** Класс-модификатор секции (фоновые вариации). */
    className?: string;
    /** Заглушка пустой полки. Без неё пустая полка не рисуется вовсе;
        с ней — секция видна всегда (для полок, которые должны «жить» на странице постоянно). */
    emptyState?: React.ReactNode;
    /** Полка внутри чужой страницы (страница игры): без своего контейнера, фона и отступов секции. */
    embedded?: boolean;
    /** Клик по карточке — для аналитики подборки (индекс — место карточки в ряду). */
    onSelect?: (game: Game, index: number) => void;
}

/** Адрес товара в его разделе: игры — /games/…, ПО — /software/…. */
export const gameHref = (game: Game) => productHref(game);

export default function GameShelf({
    eyebrow,
    title,
    subtitle,
    games,
    baseUrl,
    viewAllTo,
    coverChip,
    headerAside,
    viewAllLabel,
    className,
    emptyState,
    embedded = false,
    onSelect
}: GameShelfProps) {
    const { t } = useTranslation();
    if (games.length === 0 && !emptyState) {
        return null;
    }

    // Встроенной полке контейнер не нужен: его даёт страница, а второй добавил бы поля.
    const Wrapper = embedded ? React.Fragment : "div";
    const wrapperProps = embedded ? {} : { className: "container" };

    return (
        <section className={`shelf-section ${embedded ? "shelf-section--embedded" : ""} ${className ?? ""}`}>
            <Wrapper {...wrapperProps}>
                <div className="shelf-head">
                    <div className="section-heading">
                        <div className="heading-eyebrow">{eyebrow}</div>
                        <h2>{title}</h2>
                        {subtitle && <p className="muted">{subtitle}</p>}
                    </div>
                    <div className="shelf-head-side">
                        {headerAside}
                        <Link className="link-arrow" to={viewAllTo}>
                            {viewAllLabel ?? t("common.viewAll")}
                            {/* Стрелка отдельным элементом: символ внутри текста нельзя
                                сдвинуть на наведении. */}
                            <span className="link-arrow__icon" aria-hidden="true">→</span>
                        </Link>
                    </div>
                </div>
                {games.length === 0 ? (
                    <div className="shelf-empty">{emptyState}</div>
                ) : (
                <div className="shelf-grid">
                    {games.map((game, index) => (
                        // data-hover-trailer-root: превью-ролик слушает наведение на всю карточку, а она здесь — ссылка, не article.
                        <Link
                            className="shelf-card lift"
                            key={game.id ?? game.title}
                            to={gameHref(game)}
                            data-hover-trailer-root=""
                            onClick={onSelect ? () => onSelect(game, index) : undefined}
                        >
                            <Cover className="shelf-cover" ratio="photo" sizes="(max-width: 640px) 50vw, 25vw" title={game.title} src={game.imagePath} baseUrl={baseUrl}>
                                <HoverTrailer src={normalizeGameCoverUrl(game.trailerUrl, baseUrl)} poster={normalizeGameCoverUrl(game.trailerPosterUrl, baseUrl)} title={game.title} />
                                <GameCoverOverlay game={game} chip={coverChip?.(game) ?? null} />
                            </Cover>
                            <div className="shelf-body">
                                <div className="shelf-title">{game.title}</div>
                            </div>
                        </Link>
                    ))}
                </div>
                )}
            </Wrapper>
        </section>
    );
}
