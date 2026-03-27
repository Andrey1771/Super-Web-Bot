import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import type { Game } from "../../models/game";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IUrlService } from "../../iterfaces/i-url-service";
import SafeGameImage from "../common/SafeGameImage";
import { slugify } from "../../utils/slugify";
import "./featured-storefront-section.css";

type FeaturedStorefrontSectionProps = {
  games: Game[];
  isLoading: boolean;
};

const storefrontPerks = ["Instant delivery", "Verified payments", "Refund policy"];

const FeaturedStorefrontSection: React.FC<FeaturedStorefrontSectionProps> = ({ games, isLoading }) => {
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
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

  const getDescription = (game: Game) => {
    const value = game.description?.trim();
    if (!value) {
      return "Premium pick with instant delivery and secure checkout.";
    }

    return value;
  };

  return (
    <section className="featured-billboard">
      <div className="container">
        <div className="billboard-header">
          <div>
            <div className="eyebrow">FEATURED / POPULAR</div>
            <h2>Featured / Popular games</h2>
            <div className="billboard-sub">{featuredGames.length} picks available</div>
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
                <Link className="billboard-hero-link" to={getGameHref(activeGame)}>
                  <div className="billboard-frame" key={activeGame.id || activeGame.title}>
                    <SafeGameImage
                      className="billboard-cover"
                      gameTitle={activeGame.title}
                      src={activeGame.imagePath}
                      baseUrl={urlService.apiBaseUrl}
                    />
                    <div className="billboard-frame-badge">Top pick</div>
                  </div>

                  <div className="billboard-info-card">
                    <span className="billboard-meta">{getMeta(activeGame)}</span>
                    <h3 className="billboard-title">{activeGame.title}</h3>

                    <div className="billboard-genres" aria-label="Game genres">
                      {(activeGame.genres ?? []).slice(0, 4).map((genre) => (
                        <span className="billboard-genre-chip" key={`${activeGame.id}-${genre}`}>
                          {genre}
                        </span>
                      ))}
                    </div>

                    <p className="billboard-desc muted">{getDescription(activeGame)}</p>

                    <div className="billboard-price-row">
                      {getPriceInfo(activeGame).hasDiscount ? (
                        <>
                          <span className="billboard-price-current">
                            ${getPriceInfo(activeGame).discountedPrice.toFixed(2)}
                          </span>
                          <span className="billboard-price-old">
                            ${getPriceInfo(activeGame).regularPrice.toFixed(2)}
                          </span>
                          <span className="billboard-discount-badge">-{getPriceInfo(activeGame).discountPercent}%</span>
                        </>
                      ) : (
                        <span className="billboard-price-current">
                          ${getPriceInfo(activeGame).discountedPrice.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="billboard-footer">
                      <div className="billboard-trust" aria-label="Store trust points">
                        {storefrontPerks.map((perk) => (
                          <span key={perk}>{perk}</span>
                        ))}
                      </div>

                      <span className="billboard-cta">
                        Open game
                        <FontAwesomeIcon icon={faArrowRight} />
                      </span>
                    </div>
                  </div>
                </Link>
              </div>

              <aside className="billboard-rail" aria-label="Featured picks list">
                <div className="rail-head">
                  <span>Top Picks</span>
                  <span>{featuredGames.length} available</span>
                </div>

                <div className="rail-list" ref={railListRef}>
                  {featuredGames.map((game, index) => {
                    const priceInfo = getPriceInfo(game);

                    return (
                      <button
                        key={game.id || game.title}
                        type="button"
                        className={`rail-item ${index === activeIndex ? "active" : ""}`}
                        onClick={() => setActiveIndex(index)}
                        onMouseEnter={() => setActiveIndex(index)}
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
                            <span className="rail-name">{game.title}</span>
                            <span className="rail-meta">{getMeta(game)}</span>
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
