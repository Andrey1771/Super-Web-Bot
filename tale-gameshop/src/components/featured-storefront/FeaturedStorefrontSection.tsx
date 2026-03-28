import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import type { Game } from "../../models/game";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IUrlService } from "../../iterfaces/i-url-service";
import { useCart } from "../../context/cart-context";
import type { Product } from "../../reducers/cart-reducer";
import SafeGameImage from "../common/SafeGameImage";
import { slugify } from "../../utils/slugify";
import "./featured-storefront-section.css";

type FeaturedStorefrontSectionProps = {
  games: Game[];
  isLoading: boolean;
};

const storefrontPerks = ["Instant delivery", "Verified payments", "Refund policy"];
const gameTypeLabels: Record<number, string> = {
  0: "Action",
  1: "Adventure",
  2: "RPG",
  3: "Simulation",
  4: "Strategy",
  5: "Puzzle",
  6: "Sports",
  7: "Card & Board",
  8: "MMO",
  9: "Horror",
  10: "Casual",
  11: "Educational"
};

const FeaturedStorefrontSection: React.FC<FeaturedStorefrontSectionProps> = ({ games, isLoading }) => {
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
  const navigate = useNavigate();
  const { dispatch } = useCart();
  const railListRef = useRef<HTMLDivElement | null>(null);

  const featuredGames = useMemo(() => {
    const ranked = games
      .filter((game) => game.showInFeaturedStorefront)
      .sort((a, b) => {
        const rankA = a.featuredStorefrontPriority ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.featuredStorefrontPriority ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
          return rankA - rankB;
        }

        return a.title.localeCompare(b.title);
      });

    if (ranked.length > 0) {
      return ranked;
    }

    return [...games]
      .sort((a, b) => {
        const dateA = Date.parse(a.releaseDate || "");
        const dateB = Date.parse(b.releaseDate || "");
        return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
      })
      .slice(0, 10);
  }, [games]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!featuredGames.length) {
      setActiveIndex(0);
      return;
    }

    if (activeIndex > featuredGames.length - 1) {
      setActiveIndex(0);
    }
  }, [activeIndex, featuredGames]);

  useEffect(() => {
    const railList = railListRef.current;
    if (!railList) {
      return;
    }

    const activeItem = railList.querySelector<HTMLButtonElement>(".rail-item.active");
    activeItem?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex]);

  const activeGame = featuredGames[activeIndex] ?? null;

  const getGameHref = (game: Game) => {
    const fallbackSlug = slugify(game.slug?.trim() || game.title || game.name || "game");
    return `/games/${fallbackSlug}`;
  };

  const openGamePage = (game: Game) => {
    navigate(getGameHref(game));
  };

  const handleAddToCart = (event: React.MouseEvent<HTMLButtonElement>, game: Game) => {
    event.stopPropagation();
    const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
    const finalPrice = Number.isFinite(game.finalPrice ?? game.price)
      ? Number(game.finalPrice ?? game.price)
      : regularPrice;

    dispatch({
      type: "ADD_TO_CART",
      payload: {
        gameId: game.id ?? "",
        name: game.name,
        price: finalPrice,
        quantity: 1,
        image: game.imagePath
      } as Product
    });
  };

  const getPriceInfo = (game: Game) => {
    const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
    const discountedPrice = Number.isFinite(game.finalPrice ?? game.price)
      ? Number(game.finalPrice ?? game.price)
      : regularPrice;

    const hasDiscount = Boolean(
      game.discountActive &&
      game.discountPercent &&
      game.discountPercent > 0 &&
      discountedPrice < regularPrice
    );

    return {
      regularPrice,
      discountedPrice,
      hasDiscount,
      discountPercent: hasDiscount ? Math.round(Number(game.discountPercent)) : null
    };
  };

  const getMeta = (game: Game) => {
    const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;
    if (releaseYear && !Number.isNaN(releaseYear)) {
      return `${releaseYear} • Instant delivery`;
    }

    return "Instant delivery";
  };

  const getGameTypeLabel = (game: Game) => {
    const primaryGenre = game.genres?.[0]?.trim();
    if (primaryGenre) {
      return primaryGenre;
    }

    return gameTypeLabels[game.gameType] ?? "Game";
  };

  const getRailMeta = (game: Game) => {
    const compactType = gameTypeLabels[game.gameType] ?? "Game";
    const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;
    if (releaseYear && !Number.isNaN(releaseYear)) {
      return `${compactType} • ${releaseYear}`;
    }

    return `${compactType} • Instant`;
  };

  const getDisplayGenres = (game: Game) => {
    const genres = (game.genres ?? [])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (genres.length > 0) {
      return genres;
    }

    return [getGameTypeLabel(game)];
  };

  const getPickCountLabel = (count: number) => `${count} ${count === 1 ? "pick" : "picks"} available`;

  const activePriceInfo = activeGame ? getPriceInfo(activeGame) : null;

  return (
    <section className="featured-billboard">
      <div className="container">
        <div className="billboard-header">
          <div>
            <div className="eyebrow">FEATURED / POPULAR</div>
            <h2>Featured / Popular games</h2>
            <div className="billboard-sub">Top picks • Updated weekly</div>
          </div>
          <div className="billboard-actions">
            <Link className="billboard-link" to="/games">
              Browse all
            </Link>
          </div>
        </div>

        <div className="billboard-surface premium-storefront">
          {isLoading ? (
            <>
              <div className="billboard-left">
                <div className="billboard-frame skeleton-card" aria-hidden="true">
                  <div className="media-placeholder skeleton" />
                </div>
                <div className="billboard-copy">
                  <span className="skeleton-line skeleton" />
                  <span className="skeleton-line skeleton" />
                  <span className="skeleton-line skeleton skeleton-line-short" />
                </div>
              </div>
              <aside className="billboard-rail" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="rail-item skeleton-card" key={`featured-skeleton-${index}`}>
                    <span className="skeleton-line skeleton" />
                  </div>
                ))}
              </aside>
            </>
          ) : activeGame ? (
            <>
              <div className="billboard-left">
                <article
                  className="featured-card-shell"
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${activeGame.title}`}
                  onClick={() => openGamePage(activeGame)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openGamePage(activeGame);
                    }
                  }}
                >
                  <div className="billboard-frame" key={activeGame.id || activeGame.title}>
                    <SafeGameImage
                      className="billboard-cover"
                      gameTitle={activeGame.title}
                      src={activeGame.imagePath}
                      baseUrl={urlService.apiBaseUrl}
                    />
                    <div className="billboard-frame-badge">
                      <span className="billboard-frame-badge-spark" aria-hidden="true">◆</span>
                      <span>FEATURED PICK</span>
                    </div>
                  </div>

                  <div className="billboard-info-card">
                    <div className="billboard-info-grid">
                      <div className="billboard-main-content">
                        <div className="billboard-meta-line">
                          {getGameTypeLabel(activeGame)} • Instant delivery
                        </div>
                        <h3 className="billboard-title">{activeGame.title}</h3>

                        <div className="billboard-genres" aria-label="Game genres">
                          {getDisplayGenres(activeGame).map((genre) => (
                            <span className="billboard-genre-chip" key={`${activeGame.id}-${genre}`}>
                              {genre}
                            </span>
                          ))}
                        </div>

                      </div>

                      <div className="billboard-commerce-content">
                        {activePriceInfo?.hasDiscount && <div className="billboard-price-prefix">From</div>}
                        <div className="billboard-price-row">
                          {activePriceInfo?.hasDiscount ? (
                            <>
                              <span className="billboard-price-old">${activePriceInfo.regularPrice.toFixed(2)}</span>
                              <span className="billboard-price-current">${activePriceInfo.discountedPrice.toFixed(2)}</span>
                              <span className="billboard-discount-badge">-{activePriceInfo.discountPercent}%</span>
                            </>
                          ) : (
                            <span className="billboard-price-current">
                              ${activePriceInfo?.discountedPrice.toFixed(2)}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          className="billboard-cta"
                          onClick={(event) => handleAddToCart(event, activeGame)}
                          aria-label={`Add ${activeGame.title} to cart`}
                        >
                          Add to cart
                          <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                      </div>

                      <div className="billboard-trust" aria-label="Store trust points">
                        {storefrontPerks.map((perk) => (
                          <span key={perk}>{perk}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              </div>

              <aside className="billboard-rail" aria-label="Featured picks list">
                <div className="rail-head">
                  <span>Top Picks</span>
                  <span>{getPickCountLabel(featuredGames.length)}</span>
                </div>

                <div className={`rail-list ${featuredGames.length <= 3 ? "is-compact" : ""}`} ref={railListRef}>
                  {featuredGames.map((game, index) => {
                    const priceInfo = getPriceInfo(game);

                    return (
                      <button
                        key={game.id || game.title}
                        type="button"
                        className={`rail-item ${index === activeIndex ? "active" : ""}`}
                        onClick={() => setActiveIndex(index)}
                        onFocus={() => setActiveIndex(index)}
                        aria-pressed={index === activeIndex}
                      >
                        <div className="rail-left">
                          <div className="rail-thumb">
                            <SafeGameImage
                              className="rail-thumb-image"
                              gameTitle={game.title}
                              src={game.imagePath}
                              baseUrl={urlService.apiBaseUrl}
                            />
                          </div>
                          <div className="rail-text">
                            <span className="rail-name" title={game.title}>{game.title}</span>
                            <span className="rail-meta" title={`${getGameTypeLabel(game)} • ${getMeta(game)}`}>{getRailMeta(game)}</span>
                          </div>
                        </div>

                        <div className="rail-price-column">
                          {priceInfo.hasDiscount ? (
                            <>
                              <span className="rail-price">${priceInfo.discountedPrice.toFixed(2)}</span>
                              <span className="rail-price-old">${priceInfo.regularPrice.toFixed(2)}</span>
                            </>
                          ) : (
                            <span className="rail-price">${priceInfo.discountedPrice.toFixed(2)}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Link className="rail-browse-all" to="/games">
                  <span>Browse all picks</span>
                  <FontAwesomeIcon icon={faArrowRight} />
                </Link>
              </aside>
            </>
          ) : (
            <div className="billboard-empty-state">
              <h3>No featured games yet</h3>
              <p className="muted">
                Add games to Featured / Top Picks in admin and they will appear here automatically.
              </p>
              <Link className="btn btn-outline" to="/games">
                Browse catalog
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default FeaturedStorefrontSection;
