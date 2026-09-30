import { useTranslation } from "react-i18next";
import React from "react";
import { Link } from "react-router-dom";
import { Game } from "../../models/game";
import Cover from "../common/Cover";
import HoverTrailer from "../common/HoverTrailer";
import { normalizeGameCoverUrl } from "../../utils/game-cover";
import { formatMoney } from "../../context/site-preferences";
import { useWishlist } from "../../context/wishlist-context";
import { PLATFORM_ICONS } from "../common/GameCoverOverlay";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { isSoftware, OS_SHORT } from "../../utils/software";
import { padCountdown, useCountdown } from "../tale-gameshop-main-page/DealsCountdown";

/**
 * Главная скидка страницы — крупная карточка на месте четырёх обычных.
 *
 * Ровная сетка одинаковых плиток честна, но у неё нет входа: взгляду не за что зацепиться,
 * и первая карточка выигрывает только потому, что стоит первой. Здесь она названа вслух —
 * «Star deal» — и показывает то, чего в плитке не помещается: сколько денег экономит покупка
 * и сколько времени на неё осталось.
 *
 * Что именно сюда попадает, решает выбранный порядок: в «Biggest discount» — самая крупная
 * скидка, в «Ending soon» — самая срочная. Так переключатель меняет не только сортировку,
 * но и героя страницы.
 */
export interface DealSpotlightCardProps {
    game: Game;
    regularPrice: number;
    finalPrice: number;
    percent: number;
    currency: string;
    baseUrl: string;
    href: string;
    onAddToCart: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Звезда-подпись: маленькая, в строке надзаголовка. */
const StarGlyph: React.FC = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
        <path
            d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.6 6.4 19.8l1.3-6.3L2.9 9.2l6.4-.7z"
            fill="currentColor"
        />
    </svg>
);

const DealSpotlightCard: React.FC<DealSpotlightCardProps> = ({
    game,
    regularPrice,
    finalPrice,
    percent,
    currency,
    baseUrl,
    href,
    onAddToCart,
}) => {
    const { t } = useTranslation();
    const countdown = useCountdown(game.discountEndsAt);
    const saved = Math.max(0, regularPrice - finalPrice);
    const { isWishlisted, toggle: toggleWishlist } = useWishlist();
    const wishlisted = isWishlisted(game.id);
    // Платформы — как на обычной плитке (иконка), но с подписью: места здесь хватает, а одна иконка без
    // текста на большой карточке читалась бы как украшение. У ПО — системы короткими подписями.
    const software = isSoftware(game.kind);
    const platforms = software ? [] : (game.platforms ?? []).filter((platform) => PLATFORM_ICONS[platform]);
    const systems = software ? (game.platforms ?? []).filter((platform) => OS_SHORT[platform]) : [];

    return (
        <article className="deal-spotlight">
            {/* Вертикальная рамка 3:4 (на телефоне — широкая, см. css); размытая крошечная копия пока грузится. */}
            <Cover
                className="deal-spotlight-media"
                ratio="portrait"
                sizes="(max-width: 900px) 100vw, 320px"
                title={game.title}
                src={game.imagePath}
                baseUrl={baseUrl}
                priority
                blur
            >
                {/* Трейлер при наведении — сразу после обложки: блик, бейджи и сердечко остаются сверху. */}
                <HoverTrailer src={normalizeGameCoverUrl(game.trailerUrl, baseUrl)} poster={normalizeGameCoverUrl(game.trailerPosterUrl, baseUrl)} title={game.title} />
                {/* Блик проезжает по карточке на наведении — подсказка, что она живая и кликабельна. */}
                <i className="deal-spotlight-shine" aria-hidden="true"></i>
                <span className="deal-spotlight-percent">−{Math.round(percent)}%</span>
                {/* Платформы — в левом нижнем углу обложки, как у обычных плиток, но с подписью: место есть. */}
                {(platforms.length > 0 || systems.length > 0) && (
                    <ul className="deal-spotlight-platforms" aria-label={t("deals.platforms")}>
                        {platforms.map((platform) => (
                            <li key={platform}>
                                <FontAwesomeIcon icon={PLATFORM_ICONS[platform]} aria-hidden="true" />
                                {platform}
                            </li>
                        ))}
                        {systems.map((system) => (
                            <li key={system}>{OS_SHORT[system]}</li>
                        ))}
                    </ul>
                )}
            </Cover>

            {/* Сердечко — в правом верхнем углу всей карточки, а не обложки: у Star Deal обложка
                занимает половину, и сердечко на ней читалось как часть картинки. На белом поле
                кнопка фиолетовая, а не белая, иначе она бы слилась с фоном. */}
            <button
                type="button"
                className={`deal-spotlight-wishlist${wishlisted ? " is-active" : ""}`}
                aria-label={wishlisted ? t("common.removeFromWishlist") : t("common.addToWishlist")}
                aria-pressed={wishlisted}
                onClick={() => toggleWishlist(game.id)}
                disabled={!game.id}
            >
                <svg viewBox="0 0 24 24" width="18" height="18" fill={wishlisted ? "currentColor" : "none"} aria-hidden="true">
                    <path
                        d="M12 20.2c-4.4-2.8-7.4-5.5-8.7-8.4-1.4-3.1.5-6.5 3.9-6.8 2.1-.2 3.6.8 4.8 2.2 1.2-1.4 2.7-2.4 4.8-2.2 3.4.3 5.3 3.7 3.9 6.8-1.3 2.9-4.3 5.6-8.7 8.4Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>

            <div className="deal-spotlight-body">
                <span className="deal-spotlight-eyebrow">
                    <StarGlyph />
                    {t("deals.starDeal")}
                </span>

                <h3 className="deal-spotlight-title">
                    <Link to={href}>{game.title}</Link>
                </h3>

                <div className="deal-spotlight-prices">
                    <span className="deal-price-old">{formatMoney(regularPrice, currency)}</span>
                    <span className="deal-spotlight-price">{formatMoney(finalPrice, currency)}</span>
                    {saved > 0 && (
                        // Экономия суммой, а не процентом: «-54%» надо считать в уме, «$16.19» — нет.
                        <span className="deal-spotlight-saved">{t("deals.youSave", { amount: formatMoney(saved, currency) })}</span>
                    )}
                </div>

                {countdown && (
                    <p className="deal-spotlight-timer">
                        <span className="deal-spotlight-timer-label">{t("deals.offerEndsIn")}</span>
                        <span className="deal-spotlight-clock">
                            {countdown.days > 0 && <b>{countdown.days}d</b>}
                            <b>{padCountdown(countdown.hours)}</b>
                            <i aria-hidden="true">:</i>
                            <b>{padCountdown(countdown.minutes)}</b>
                            <i aria-hidden="true">:</i>
                            <b>{padCountdown(countdown.seconds)}</b>
                        </span>
                    </p>
                )}

                <div className="deal-spotlight-actions">
                    <button type="button" className="btn btn-primary" onClick={onAddToCart}>
                        {t("common.addToCart")}
                    </button>
                    <Link className="link-arrow" to={href}>
                        {t("common.details")}
                        <span className="link-arrow__icon" aria-hidden="true">→</span>
                    </Link>
                </div>
            </div>
        </article>
    );
};

export default DealSpotlightCard;
