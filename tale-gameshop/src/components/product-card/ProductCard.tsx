import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import "./product-card.css";
import { Game } from "../../models/game";
import { useCart } from "../../context/cart-context";
import { useWishlist } from "../../context/wishlist-context";
import { Product } from "../../reducers/cart-reducer";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IUrlService } from "../../iterfaces/i-url-service";
import type { IKeycloakService } from "../../iterfaces/i-keycloak-service";
import type { IRecommendationsService } from "../../iterfaces/i-recommendations-service";
import { analyticsClient } from "../../utils/analytics-client";
import { slugify } from "../../utils/slugify";
import SafeGameImage from "../common/SafeGameImage";

/**
 * Каноническая карточка товара витрины. Инкапсулирует корзину, wishlist и аналитику, поэтому
 * подключается как <ProductCard game={game} /> где угодно (каталог, рельсы, top-sellers).
 * Тема — через токены в product-card.css (светлая по умолчанию, тёмная под .theme-dark).
 */
const ProductCard: React.FC<{ game: Game }> = ({ game }) => {
  const { dispatch } = useCart();
  const { isWishlisted, toggle } = useWishlist();

  const services = useMemo(
    () => ({
      url: container.get<IUrlService>(IDENTIFIERS.IUrlService),
      keycloak: container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService),
      recs: container.get<IRecommendationsService>(IDENTIFIERS.IRecommendationsService),
    }),
    []
  );

  const slug = game.slug ? slugify(game.slug) : slugify(game.title || game.name);
  const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
  const finalPrice = Number.isFinite(game.finalPrice ?? game.price) ? Number(game.finalPrice ?? game.price) : regularPrice;
  const hasDiscount = Boolean(
    game.discountActive && game.discountPercent && game.discountPercent > 0 && finalPrice < regularPrice
  );
  const wishlisted = isWishlisted(game.id);
  const rating = Number(game.ratingAvg ?? 0);
  const reviews = Number(game.reviewsCount ?? 0);
  const platformLabel = game.platforms && game.platforms.length > 0 ? game.platforms.join(" · ") : null;

  const filledStars = Math.min(5, Math.max(0, Math.round(rating)));
  const stars = "★★★★★".slice(0, filledStars) + "☆☆☆☆☆".slice(0, 5 - filledStars);

  const recordViewed = () => {
    if (!game.id || !services.keycloak.keycloak?.authenticated) {
      return;
    }
    services.recs.postViewed(game.id, "catalog").catch(() => {
      /* аналитика не критична */
    });
  };

  const addToCart = () => {
    dispatch({
      type: "ADD_TO_CART",
      payload: {
        gameId: game.id ?? "",
        name: game.title ?? game.name,
        price: finalPrice,
        quantity: 1,
        image: game.imagePath,
      } as Product,
    });
    analyticsClient.trackEcommerce("add_to_cart", {
      value: finalPrice,
      items: [{ item_id: game.id ?? "", item_name: game.title, price: finalPrice, quantity: 1 }],
    });
  };

  return (
    <article className="product-card">
      <div className="pc-cover">
        <Link
          to={`/games/${slug}`}
          className="pc-cover-link"
          aria-label={`Open ${game.title}`}
          onClick={recordViewed}
        />
        <SafeGameImage
          gameTitle={game.title}
          src={game.imagePath}
          baseUrl={services.url.apiBaseUrl}
          className="pc-cover-img"
          loading="lazy"
        />
        {hasDiscount && <span className="pc-badge-off">−{Number(game.discountPercent).toFixed(0)}%</span>}
        {platformLabel && <span className="pc-badge-plat">{platformLabel}</span>}
        <button
          type="button"
          className={`pc-wish ${wishlisted ? "is-on" : ""}`}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
          onClick={() => toggle(game.id)}
          disabled={!game.id}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill={wishlisted ? "currentColor" : "none"}>
            <path
              d="M12 20C7.5 17 4 14 4 10.5A4 4 0 0 1 12 8a4 4 0 0 1 8 2.5C20 14 16.5 17 12 20z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className="pc-body">
        <h3 className="pc-title">
          <Link to={`/games/${slug}`} onClick={recordViewed}>
            {game.title}
          </Link>
        </h3>
        {reviews > 0 && (
          <div className="pc-rating">
            <span className="pc-stars">{stars}</span> {rating.toFixed(1)} · {reviews.toLocaleString()}
          </div>
        )}
        <span className="pc-instant">
          <span className="pc-dot" /> Instant delivery
        </span>
        <div className="pc-foot">
          <div className="pc-price">
            {hasDiscount && <span className="pc-old">${regularPrice.toFixed(2)}</span>}
            <span className="pc-now">${finalPrice.toFixed(2)}</span>
          </div>
          <button type="button" className="pc-add" aria-label="Add to cart" onClick={addToCart}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
