import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './game-details-page.css';
import {
  DLC,
  Edition,
  GameCardItem,
  GameDetails,
  GameDetailsResponse,
  GameSystemRequirements,
  MediaItem,
  QAItem,
  QuickInfoTile,
  RatingBreakdownItem,
  Review,
  ReviewTag
} from '../../types/game-details';
import IDENTIFIERS from '../../constants/identifiers';
import container from '../../inversify.config';
import type { IKeycloakService } from '../../iterfaces/i-keycloak-service';
import type { IGameDetailsService } from '../../iterfaces/i-game-details-service';
import type { GameReviewFilters } from '../../types/game-details-service';
import { getAnonId } from '../../hooks/use-blog-tracking';
import SafeGameImage from '../../components/common/SafeGameImage';
import { useWishlist } from '../../context/wishlist-context';
import { useCart } from '../../context/cart-context';
import { Product } from '../../reducers/cart-reducer';
import NotFoundPage from '../../components/utils/not-found-page/not-found-page';

const formatPrice = (price: number, currency: string) => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  });
  return formatter.format(price);
};

const formatDuration = (durationSec?: number) => {
  if (!durationSec) return '';
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

type DetailRow = { id: string; label: string; value: string | string[] };

const StarRating = ({ rating, size = 16 }: { rating: number; size?: number }) => {
  const fullStars = Math.floor(rating);
  const halfStar = rating - fullStars >= 0.5;

  return (
    <div className="star-rating" aria-label={`Rating ${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, index) => {
        const isFull = index < fullStars;
        const isHalf = index === fullStars && halfStar;
        return (
          <svg
            key={`star-${index}`}
            width={size}
            height={size}
            viewBox="0 0 20 20"
            className={`star ${isFull ? 'is-full' : ''} ${isHalf ? 'is-half' : ''}`}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`half-${index}`} x1="0" x2="1">
                <stop offset="50%" stopColor="currentColor" />
                <stop offset="50%" stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z"
              fill={isHalf ? `url(#half-${index})` : 'currentColor'}
            />
          </svg>
        );
      })}
    </div>
  );
};

const GameMediaGallery = ({
  media,
  title,
  onMediaPlay
}: {
  media: MediaItem[];
  title: string;
  onMediaPlay?: (item: MediaItem) => void;
}) => {
  if (media.length === 0) {
    return (
      <div className="game-media-gallery">
        <div className="game-media-main card">
          <div className="game-media-image">
            <div className="media-placeholder">No media available</div>
          </div>
        </div>
      </div>
    );
  }
  const [selectedId, setSelectedId] = useState(media[0]?.id ?? '');
  const [isPlaying, setIsPlaying] = useState(false);
  const thumbnailRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const selectedMedia = media.find((item) => item.id === selectedId) ?? media[0];

  const updateScrollState = () => {
    const node = thumbnailRef.current;
    if (!node) return;
    setCanScrollLeft(node.scrollLeft > 0);
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
  };

  useEffect(() => {
    updateScrollState();
    setIsPlaying(false);
    const node = thumbnailRef.current;
    if (!node) return;
    const handleScroll = () => updateScrollState();
    node.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', updateScrollState);
    return () => {
      node.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [media.length, selectedId]);

  useEffect(() => {
    if (isPlaying && selectedMedia && selectedMedia.type === 'video') {
      onMediaPlay?.(selectedMedia);
    }
  }, [isPlaying, onMediaPlay, selectedMedia]);

  const scrollByAmount = (amount: number) => {
    const node = thumbnailRef.current;
    if (!node) return;
    node.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div className="game-media-gallery">
      <div className="game-media-main card">
        {selectedMedia?.type === 'video' ? (
          <div className="game-media-video">
            {isPlaying ? (
              <video controls autoPlay poster={selectedMedia.posterUrl ?? selectedMedia.thumbUrl} aria-label={`${title} trailer`}>
                <source src={selectedMedia.url} />
              </video>
            ) : (
              <button
                type="button"
                className="video-poster"
                onClick={() => setIsPlaying(true)}
                aria-label="Play trailer"
              >
                <SafeGameImage src={selectedMedia.posterUrl ?? selectedMedia.thumbUrl} gameTitle={title} fallbackAlt="Game trailer poster" />
                <span className="video-play">▶</span>
              </button>
            )}
          </div>
        ) : (
          <div className="game-media-image">
            <SafeGameImage src={selectedMedia?.url} gameTitle={title} />
          </div>
        )}
      </div>
      <div className="thumbnail-strip-wrapper">
        {canScrollLeft && (
          <button
            className="thumbnail-nav left"
            type="button"
            aria-label="Scroll thumbnails left"
            onClick={() => scrollByAmount(-220)}
          >
            ‹
          </button>
        )}
        <div className="thumbnail-strip" ref={thumbnailRef}>
          {media.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`thumbnail-item ${selectedId === item.id ? 'is-active' : ''}`}
              onClick={() => setSelectedId(item.id)}
            >
              <SafeGameImage src={item.thumbUrl} gameTitle={title} fallbackAlt="Game preview" loading="lazy" />
              {item.type === 'video' && (
                <span className="thumbnail-video">
                  <span className="play-badge" aria-hidden="true">▶</span>
                  <span className="duration">{formatDuration(item.durationSec)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
        {canScrollRight && (
          <button
            className="thumbnail-nav right"
            type="button"
            aria-label="Scroll thumbnails right"
            onClick={() => scrollByAmount(220)}
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
};

const GamePurchaseCard = ({
  pricing,
  ratingSummary,
  gameId,
  gameTitle,
  coverUrl
}: {
  pricing: { price: number; oldPrice?: number; currency: string; discountPercent?: number };
  ratingSummary: { average: number; totalReviews: number; label: string };
  gameId?: string;
  gameTitle?: string;
  coverUrl?: string;
}) => {
  const { isWishlisted, toggle } = useWishlist();
  const { state: cartState, dispatch } = useCart();
  const wishlisted = isWishlisted(gameId);
  const inCart = Boolean(gameId) && cartState.items.some((item) => item.gameId === gameId);

  const handleCartClick = () => {
    if (!gameId) {
      return;
    }
    if (inCart) {
      dispatch({ type: 'REMOVE_FROM_CART', payload: gameId });
    } else {
      dispatch({
        type: 'ADD_TO_CART',
        payload: {
          gameId,
          name: gameTitle ?? '',
          price: pricing.price,
          quantity: 1,
          image: coverUrl ?? ''
        } as Product
      });
    }
  };

  return (
    <div className="purchase-card card">
      <div className="purchase-price">
        <div className="price-row">
          <span className="price">{formatPrice(pricing.price, pricing.currency)}</span>
          {pricing.oldPrice && <span className="old-price">{formatPrice(pricing.oldPrice, pricing.currency)}</span>}
        </div>
        {pricing.discountPercent && <span className="discount">Save {pricing.discountPercent}% today</span>}
      </div>
      <div className="purchase-rating">
        <StarRating rating={ratingSummary.average} size={14} />
        <span className="rating-value">{ratingSummary.average.toFixed(1)}</span>
        <span className="rating-pill">{ratingSummary.label}</span>
      </div>
      <div className="purchase-actions">
        <button
          className={`btn ${inCart ? 'btn-outline' : 'btn-primary'}`}
          type="button"
          onClick={handleCartClick}
          disabled={!gameId}
        >
          {inCart ? 'Remove from cart' : 'Add to cart'}
        </button>
        <button
          className={`btn btn-outline purchase-wishlist ${wishlisted ? 'is-active' : ''}`}
          type="button"
          onClick={() => toggle(gameId)}
          disabled={!gameId}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          title={wishlisted ? 'In your wishlist' : 'Add to wishlist'}
        >
          <svg viewBox="0 0 24 24" className="purchase-wishlist-icon" fill={wishlisted ? 'currentColor' : 'none'} aria-hidden="true">
            <path
              d="M12 20.2c-4.4-2.8-7.4-5.5-8.7-8.4-1.4-3.1.5-6.5 3.9-6.8 2.1-.2 3.6.8 4.8 2.2 1.2-1.4 2.7-2.4 4.8-2.2 3.4.3 5.3 3.7 3.9 6.8-1.3 2.9-4.3 5.6-8.7 8.4Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          {wishlisted ? 'In wishlist' : 'Wishlist'}
        </button>
      </div>
      <p className="purchase-note">Instant delivery • Official key • Refund policy</p>
    </div>
  );
};

const GameQuickInfoTiles = ({ tiles }: { tiles: QuickInfoTile[] }) => {
  const resolveIcon = (icon: string) => {
    switch (icon) {
      case 'language':
        return '🌐';
      case 'age':
        return '🔞';
      case 'online':
        return '🎮';
      case 'controller':
      default:
        return '🕹️';
    }
  };

  return (
    <div className="quick-info-grid">
      {tiles.map((tile) => (
        <div key={tile.id} className="quick-info-tile card">
          <span className="quick-info-icon" aria-hidden="true">
            {resolveIcon(tile.icon)}
          </span>
          <div>
            <p className="tile-label">{tile.label}</p>
            <p className="tile-value">{tile.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

const GameStickyTabs = ({ tabs }: { tabs: { id: string; label: string }[] }) => {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');

  useEffect(() => {
    const sections = tabs
      .map((tab) => document.getElementById(tab.id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (sections.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0.1 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [tabs]);

  const handleTabClick = (id: string) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="game-details-tabs">
      <div className="tabs-pill">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-pill ${activeId === tab.id ? 'is-active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            aria-current={activeId === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const AboutGameCard = ({ descriptionMarkdown, features, awards }: { descriptionMarkdown: string; features: string[]; awards: GameDetails["awards"] }) => {
  const paragraphs = descriptionMarkdown
    ? descriptionMarkdown.split(/\n\n+/).map((text) => text.trim()).filter(Boolean)
    : ["No description available yet."];

  return (
    <div className="card" id="overview">
      <h2>About this game</h2>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <div className="features">
        <h3>Key features</h3>
        <ul>
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
      <div className="awards">
        <h3>Awards & nominations</h3>
        <div className="award-row">
          {awards.map((award) => (
            <span key={award.title} className="award-pill">
              🏆 {award.title}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const GameplayCard = ({ trailer, screenshots }: { trailer?: MediaItem; screenshots: MediaItem[] }) => {
  const [activeShot, setActiveShot] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

  return (
    <div className="card" id="gameplay">
      <h2>Gameplay & trailer</h2>
      <div className="video-card">
        <div className="video-frame">
          {trailer ? (
            <>
              <video
                ref={videoRef}
                controls
                poster={trailer.posterUrl ?? trailer.thumbUrl}
                aria-label="Official gameplay trailer"
                onPlay={() => setIsTrailerPlaying(true)}
                onPause={() => setIsTrailerPlaying(false)}
              >
                <source src={trailer.url} />
              </video>
              {!isTrailerPlaying && (
                <button type="button" className="video-overlay" onClick={handlePlay} aria-label="Play trailer">
                  <span className="play-icon" aria-hidden="true">▶</span>
                </button>
              )}
            </>
          ) : (
            <div className="video-empty">Trailer coming soon</div>
          )}
          <span className="video-label">Official Gameplay Trailer</span>
        </div>
      </div>
      <div className="screenshot-grid">
        {screenshots.map((shot) => (
          <button
            key={shot.id}
            type="button"
            className="screenshot-item"
            onClick={() => setActiveShot(shot.url)}
            aria-label="Open screenshot"
          >
            <img src={shot.url} alt="Gameplay screenshot" loading="lazy" />
            <span className="screenshot-overlay">View</span>
          </button>
        ))}
      </div>
      {activeShot && (
        <div className="lightbox" role="dialog" aria-modal="true">
          <button
            type="button"
            className="lightbox-backdrop"
            aria-label="Close"
            onClick={() => setActiveShot(null)}
          />
          <div className="lightbox-content">
            <img src={activeShot} alt="Selected screenshot" />
            <button type="button" className="lightbox-close" onClick={() => setActiveShot(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const GameDetailsCard = ({ details }: { details: DetailRow[] }) => (
  <div className="card" id="details">
    <h2>Game details</h2>
    <div className="detail-rows">
      {details.map((detail) => (
        <div key={detail.id} className="detail-row">
          <span className="detail-label">{detail.label}</span>
          <span className="detail-value">
            {Array.isArray(detail.value) ? detail.value.join(', ') : detail.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const SystemRequirementsCard = ({ requirements }: { requirements: GameSystemRequirements }) => (
  <div className="card" id="system-requirements">
    <h2>System requirements</h2>
    {requirements?.windows && (
      <div className="requirements-block">
        <h3>Windows</h3>
        <div className="detail-rows">
          {Object.entries(requirements.windows.minimum ?? {}).map(([key, value]) => (
            <div key={`win-min-${key}`} className="detail-row">
              <span className="detail-label">{key.toUpperCase()}</span>
              <span className="detail-value">{value as string}</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const EditionSelector = ({
  editions,
  selectedId,
  onSelect
}: {
  editions: Edition[];
  selectedId: string;
  onSelect: (id: string) => void;
}) => (
  <div className="card" id="dlc-editions">
    <h2>Edition</h2>
    <div className="edition-list">
      {editions.map((edition) => (
        <label key={edition.code} className={`edition-item ${selectedId === edition.code ? 'is-active' : ''}`}>
          <input
            type="radio"
            name="edition"
            checked={selectedId === edition.code}
            onChange={() => onSelect(edition.code)}
          />
          <div>
            <p className="edition-name">{edition.title}</p>
            <p className="edition-description">{edition.description}</p>
          </div>
          <div className="edition-pricing">
            <span className="edition-price">{formatPrice(edition.price, 'USD')}</span>
            {edition.discountPercent && (
              <span className="edition-old">
                {formatPrice(edition.price / (1 - edition.discountPercent / 100), 'USD')}
              </span>
            )}
          </div>
        </label>
      ))}
    </div>
  </div>
);

const DLCList = ({ items }: { items: DLC[] }) => (
  <div className="card">
    <h2>DLC & bundles</h2>
    <div className="dlc-list">
      {items.map((dlc) => (
        <div key={dlc.id} className="dlc-item">
          <SafeGameImage src={dlc.coverUrl} gameTitle={dlc.title} />
          <div>
            <p className="dlc-title">{dlc.title}</p>
            <span className="dlc-price">{formatPrice(dlc.price, 'USD')}</span>
          </div>
          <button type="button" className="btn btn-outline" disabled title="Coming soon">
            Add
          </button>
        </div>
      ))}
    </div>
  </div>
);

const DeveloperPublisherCard = ({ items }: { items: { id: string; name: string; logoUrl: string; website: string }[] }) => (
  <div className="card">
    <h2>Developer & publisher</h2>
    <div className="studio-list">
      {items.map((studio) => (
        <a key={studio.id} href={studio.website} className="studio-item" target="_blank" rel="noreferrer">
          <img src={studio.logoUrl} alt={studio.name} />
          <div>
            <p className="studio-name">{studio.name}</p>
            <span className="studio-link">View studio</span>
          </div>
        </a>
      ))}
    </div>
    <button type="button" className="btn btn-outline" disabled title="Coming soon">
      More games from this studio
    </button>
  </div>
);

const ReviewsSummary = ({
  ratingSummary,
  breakdown,
  tags
}: {
  ratingSummary: { average: number; totalReviews: number; label: string };
  breakdown: RatingBreakdownItem[];
  tags: ReviewTag[];
}) => (
  <div className="card review-summary">
    <div className="review-summary-header">
      <div>
        <span className="review-score">{ratingSummary.average.toFixed(1)}</span>
        <StarRating rating={ratingSummary.average} size={16} />
        <p className="review-count">{ratingSummary.totalReviews.toLocaleString()} reviews</p>
      </div>
      <div className="review-label">{ratingSummary.label}</div>
    </div>
    <div className="review-breakdown">
      {breakdown.map((item) => (
        <div key={item.rating} className="review-bar">
          <span>{item.rating}</span>
          <div className="bar-track">
            <span className="bar-fill" style={{ width: `${item.percent}%` }} />
          </div>
          <span>{item.percent}%</span>
        </div>
      ))}
    </div>
    <div className="review-tags">
      {tags.map((tag) => (
        <span key={tag.id} className="tag-chip">
          {tag.label}
        </span>
      ))}
    </div>
  </div>
);

const ReviewCard = ({
  review,
  onHelpful,
  onReport,
  canInteract
}: {
  review: Review;
  onHelpful: (reviewId: string) => void;
  onReport: (reviewId: string) => void;
  canInteract: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card review-card">
      <div className="review-header">
        <div className="review-user">
          <img src={review.avatarUrl} alt={review.userName} />
          <div>
            <p className="review-name">{review.userName}</p>
            {review.verifiedPurchase && <span className="verified">Verified purchase</span>}
          </div>
        </div>
        <div className="review-meta">
          <StarRating rating={review.rating} size={14} />
          {review.playtimeHours && <span>{review.playtimeHours.toFixed(1)}h played</span>}
          <span>{review.createdAt}</span>
        </div>
      </div>
      <p className={`review-text ${expanded ? 'is-expanded' : ''}`}>{review.text}</p>
      <button type="button" className="btn btn-link" onClick={() => setExpanded((prev) => !prev)}>
        {expanded ? 'Show less' : 'Read more'}
      </button>
      {review.images?.[0]?.url && (
        <img className="review-shot" src={review.images[0].url} alt="Review screenshot" loading="lazy" />
      )}
      <div className="review-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onHelpful(review.id)} disabled={!canInteract}>
          👍 Helpful ({review.helpfulCount})
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onReport(review.id)} disabled={!canInteract}>
          Report
        </button>
      </div>
    </div>
  );
};

const ReviewList = ({
  reviews,
  onHelpful,
  onReport,
  canInteract
}: {
  reviews: Review[];
  onHelpful: (reviewId: string) => void;
  onReport: (reviewId: string) => void;
  canInteract: boolean;
}) => (
  <div className="review-list">
    {reviews.map((review) => (
      <ReviewCard key={review.id} review={review} onHelpful={onHelpful} onReport={onReport} canInteract={canInteract} />
    ))}
  </div>
);

const WriteReviewCard = ({
  isAuthenticated,
  onSubmit
}: {
  isAuthenticated: boolean;
  onSubmit: (payload: { rating: number; text: string; recommend: boolean }) => void;
}) => {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [recommend, setRecommend] = useState(true);

  const handleSubmit = () => {
    if (!text.trim() || rating === 0) {
      return;
    }
    onSubmit({ rating, text: text.trim(), recommend });
    setText('');
  };

  return (
    <div className="card write-review">
      <h2>Write a review</h2>
      {!isAuthenticated && (
        <div className="write-review-locked">
          <p className="muted">Sign in to leave a review</p>
          <Link to="/logIn" className="btn btn-primary">
            Sign in
          </Link>
        </div>
      )}
      <div className="write-stars" aria-label="Select rating">
        {Array.from({ length: 5 }).map((_, index) => (
          <button
            key={index}
            type="button"
            className={`star-button ${rating >= index + 1 ? 'is-active' : ''}`}
            disabled={!isAuthenticated}
            onClick={() => setRating(index + 1)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="input review-textarea"
        placeholder="Share your experience..."
        disabled={!isAuthenticated}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="write-review-actions">
        <button type="button" className="btn btn-outline" disabled={!isAuthenticated} title="Coming soon">
          Add images
        </button>
        <label className="checkbox-row">
          <input
            type="checkbox"
            disabled={!isAuthenticated}
            checked={recommend}
            onChange={(event) => setRecommend(event.target.checked)}
          />
          I recommend this game
        </label>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!isAuthenticated || !text.trim() || rating === 0}
        onClick={handleSubmit}
      >
        Submit
      </button>
    </div>
  );
};

const QASection = ({
  items,
  onAsk,
  canAsk
}: {
  items: QAItem[];
  onAsk: (question: string) => void;
  canAsk: boolean;
}) => {
  const [draft, setDraft] = useState('');

  return (
    <div className="card qa-section">
      <div className="qa-header">
        <h2>Q & A</h2>
      <button type="button" className="btn btn-outline" onClick={() => onAsk(draft)} disabled={!draft.trim() || !canAsk}>
        Ask a question
      </button>
    </div>
    <input
      className="input"
      placeholder="Ask the community..."
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      disabled={!canAsk}
    />
      <div className="qa-list">
        {items.map((item) => (
          <div key={item.id} className="qa-item">
            <p className="qa-question">{item.question}</p>
            <p className="qa-answer">{item.answer ?? item.answers?.[0]?.text ?? "Awaiting response."}</p>
            <span className="qa-date">{item.createdAt}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RecommendationsCarousel = ({ items }: { items: GameCardItem[] }) => {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!trackRef.current) return;
    const offset = direction === 'left' ? -360 : 360;
    trackRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (
    <div className="recommendations">
      <div className="recommendations-header">
        <h2>More like this</h2>
        <div className="carousel-actions">
          <button type="button" className="icon-button" onClick={() => handleScroll('left')} aria-label="Scroll left">
            ‹
          </button>
          <button type="button" className="icon-button" onClick={() => handleScroll('right')} aria-label="Scroll right">
            ›
          </button>
        </div>
      </div>
      <div className="recommendations-track" ref={trackRef}>
        {items.map((item) => (
          <div key={item.id} className="recommendation-card">
            <Link to={`/games/${item.slug}`} className="recommendation-link">
              <SafeGameImage src={item.coverUrl} gameTitle={item.title} loading="lazy" />
              <p className="line-clamp-2">{item.title}</p>
            </Link>
            <div className="recommendation-meta">
              <span>{formatPrice(item.price, 'USD')}</span>
              <span className="recommendation-rating">★ {item.rating.toFixed(1)}</span>
            </div>
            <button className="btn btn-primary btn-small" type="button" disabled title="Coming soon">
              Add to cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const GameDetailsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<GameDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Несуществующая игра (404 от API) — это не «ошибка», а страница, которой нет: показываем магазинную 404.
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewFilters, setReviewFilters] = useState<GameReviewFilters>({ sort: 'createdAt:desc', page: 1, pageSize: 6 });
  const [questions, setQuestions] = useState<QAItem[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState('');

  const keycloakService = useMemo(
    () => container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService),
    []
  );
  const gameDetailsService = useMemo(
    () => container.get<IGameDetailsService>(IDENTIFIERS.IGameDetailsService),
    []
  );

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (!slug) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        setNotFound(false);
        const response = await gameDetailsService.getGameDetails(slug ?? '');
        if (isMounted) {
          setData(response);
          document.title = `${response.game.title} — Tale Shop`;
          if (response.game.editions?.length > 0) {
            const defaultEdition = response.game.editions.find((edition) => edition.isDefault) ?? response.game.editions[0];
            setSelectedEditionId(defaultEdition.code);
          }
        }
      } catch (err: any) {
        console.error('Failed to load game details', err);
        if (isMounted) {
          if (err?.response?.status === 404) {
            setNotFound(true);
          } else {
            setError('Failed to load game details. Please try again later.');
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [gameDetailsService, slug, reloadKey]);

  useEffect(() => {
    if (!data?.game?.gameId) {
      return;
    }
    const fetchReviews = async () => {
      try {
        const response = await gameDetailsService.getReviews(data.game.gameId, reviewFilters);
        setReviews(response.items);
        setReviewsTotal(response.total);
      } catch (err) {
        console.error('Failed to load reviews', err);
      }
    };
    fetchReviews();
  }, [data?.game?.gameId, gameDetailsService, reviewFilters]);

  useEffect(() => {
    if (!data?.game?.gameId) {
      return;
    }
    const fetchQuestions = async () => {
      try {
        const response = await gameDetailsService.getQuestions(data.game.gameId, 6);
        setQuestions(response.items ?? []);
      } catch (err) {
        console.error('Failed to load questions', err);
      }
    };
    fetchQuestions();
  }, [data?.game?.gameId, gameDetailsService]);

  useEffect(() => {
    if (!data?.game?.gameId) {
      return;
    }
    gameDetailsService.trackGameView({
      gameId: data.game.gameId,
      anonId: getAnonId()
    });
  }, [data?.game?.gameId, gameDetailsService]);

  const selectedEdition = data?.game.editions?.find((edition) => edition.code === selectedEditionId);
  const displayPricing = selectedEdition
    ? {
        price: selectedEdition.price,
        oldPrice: selectedEdition.discountPercent ? selectedEdition.price / (1 - selectedEdition.discountPercent / 100) : undefined,
        currency: data?.pricing.currency ?? 'USD',
        discountPercent: selectedEdition.discountPercent
      }
    : data?.pricing;
  const isAuthenticated = Boolean(keycloakService.keycloak?.authenticated);

  const renderPlatformIcon = (platform: string) => {
    const key = platform.toLowerCase();
    if (key.includes('windows')) {
      return '🪟';
    }
    if (key.includes('mac')) {
      return '🍎';
    }
    if (key.includes('linux')) {
      return '🐧';
    }
    return '💻';
  };

  if (isLoading) {
    return (
      <main className="game-details-page">
        <div className="container">
          <p>Loading game details...</p>
        </div>
      </main>
    );
  }

  // Игры с таким slug не существует — полноценная 404 магазина, а не голая строка ошибки.
  if (notFound) {
    return <NotFoundPage />;
  }

  if (error || !data || !displayPricing) {
    return (
      <main className="game-details-page">
        <div className="container">
          <div
            style={{
              margin: '48px auto',
              maxWidth: 480,
              textAlign: 'center',
              background: '#ffffff',
              border: '1px solid #ece8ff',
              borderRadius: 20,
              padding: '40px 32px',
              boxShadow: '0 12px 30px rgba(84, 58, 193, 0.08)'
            }}
          >
            <div style={{ fontSize: 40 }}>😕</div>
            <h2 style={{ margin: '12px 0 8px' }}>Something went wrong</h2>
            <p style={{ color: '#6c6393', marginBottom: 20 }}>
              {error ?? 'Failed to load game details. Please try again later.'}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setReloadKey((prev) => prev + 1)}
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  const platforms = [
    data.game.platforms.windows ? 'Windows' : null,
    data.game.platforms.mac ? 'Mac' : null,
    data.game.platforms.linux ? 'Linux' : null
  ].filter(Boolean) as string[];

  const mediaItems = data.game.gallery?.length
    ? data.game.gallery
    : data.game.cover
      ? [{
          id: 'cover',
          type: 'image',
          url: data.game.cover.url,
          thumbUrl: data.game.cover.url
        }]
      : [];
  const trailer = mediaItems.find((item) => item.isTrailer) ?? mediaItems.find((item) => item.type === 'video');
  const screenshots = mediaItems.filter((item) => item.type === 'image');

  const ratingLabel = data.ratingSummary.avg >= 4.5 ? 'Very Positive' : data.ratingSummary.avg >= 4 ? 'Positive' : 'Mixed';
  const ratingSummary = {
    average: data.ratingSummary.avg,
    totalReviews: data.ratingSummary.count,
    label: ratingLabel
  };

  const ratingBreakdown: RatingBreakdownItem[] = [5, 4, 3, 2, 1].map((rating) => {
    const count = data.ratingSummary.distribution?.[rating.toString()] ?? 0;
    const percent = data.ratingSummary.count ? Math.round((count / data.ratingSummary.count) * 100) : 0;
    return { rating, percent };
  });

  const reviewTags: ReviewTag[] = (data.game.tags ?? []).slice(0, 3).map((tag, index) => ({ id: `${index}-${tag}`, label: tag }));

  const quickInfoTiles: QuickInfoTile[] = [
    {
      id: 'languages',
      label: 'Languages',
      value: data.game.languages?.text?.length
        ? data.game.languages.text.length > 1
          ? `${data.game.languages.text[0]} + ${data.game.languages.text.length - 1} more`
          : data.game.languages.text[0]
        : 'See details',
      icon: 'language'
    },
    {
      id: 'age',
      label: 'Age rating',
      value: data.game.ageRating?.label ?? 'Not rated',
      icon: 'age'
    },
    {
      id: 'online',
      label: 'Online features',
      value: data.game.onlineFeatures?.[0] ?? 'Single-player',
      icon: 'online'
    },
    {
      id: 'controller',
      label: 'Controller support',
      value: data.game.controllerSupport ?? 'Full',
      icon: 'controller'
    }
  ];

  const detailRows: DetailRow[] = [
    { id: 'detail-genres', label: 'Genre', value: data.game.genres },
    { id: 'detail-tags', label: 'Tags', value: data.game.tags },
    { id: 'detail-online', label: 'Modes', value: data.game.onlineFeatures },
    { id: 'detail-languages', label: 'Supported languages', value: data.game.languages?.text ?? [] },
    { id: 'detail-cloud', label: 'Cloud saves', value: data.game.cloudSavesSupported ? 'Supported' : 'Not supported' }
  ];

  const developerPublisher = [
    data.game.developer ? { id: 'dev', name: data.game.developer.name, logoUrl: data.game.developer.logoUrl, website: data.game.developer.website } : null,
    data.game.publisher ? { id: 'pub', name: data.game.publisher.name, logoUrl: data.game.publisher.logoUrl, website: data.game.publisher.website } : null
  ].filter(Boolean) as { id: string; name: string; logoUrl: string; website: string }[];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'gameplay', label: 'Gameplay' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'system-requirements', label: 'System requirements' },
    { id: 'dlc-editions', label: 'DLC & editions' }
  ];

  return (
    <main className="game-details-page">
      <div className="container game-details-container">
        <div className="game-details-hero">
          <div className="hero-left">
            <GameMediaGallery
              media={mediaItems}
              title={data.game.title}
              onMediaPlay={(item) => {
                if (!data?.game?.gameId) return;
                gameDetailsService.trackMediaPlay({
                  gameId: data.game.gameId,
                  mediaId: item.id,
                  mediaType: item.type,
                  anonId: getAnonId()
                });
              }}
            />
          </div>
          <div className="hero-right">
            <nav className="breadcrumbs">
              <Link to="/">Store</Link>
              <span>/</span>
              <Link to="/games">Games</Link>
              <span>/</span>
              <span className="current">{data.game.title}</span>
            </nav>
            <h1 className="game-title">{data.game.title}</h1>
            <p className="game-tagline">{data.game.tagline}</p>
            <div className="badge-row">
              {(data.heroBadges?.length ? data.heroBadges : ['Steam key']).map((badge) => {
                const variant = badge.toLowerCase().includes('%')
                  ? 'discount'
                  : badge.toLowerCase().includes('top')
                    ? 'primary'
                    : 'neutral';
                return (
                  <span key={badge} className={`badge badge-${variant}`}>
                    {badge}
                  </span>
                );
              })}
            </div>
            <div className="hero-info-grid">
              <div className="hero-info-main">
                <div className="meta-list">
                  <div>
                    <span className="meta-label">Developer</span>
                    <span>{data.game.developer?.name ?? '—'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Publisher</span>
                    <span>{data.game.publisher?.name ?? '—'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Release date</span>
                    <span>{data.game.releaseDate ?? 'TBA'}</span>
                  </div>
                  <div>
                    <span className="meta-label">Platforms</span>
                    <div className="chip-row">
                      {platforms.map((platform) => (
                        <span key={platform} className="chip platform-chip">
                          <span className="platform-icon" aria-hidden="true">{renderPlatformIcon(platform)}</span>
                          {platform}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="meta-label">Genres</span>
                    <div className="chip-row">
                      {data.game.genres.map((genre) => (
                        <span key={genre} className="chip">
                          {genre}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rating-summary card compact">
                  <div className="rating-score">
                    <span>{ratingSummary.average.toFixed(1)}</span>
                  </div>
                  <div>
                    <StarRating rating={ratingSummary.average} />
                    <p>
                      ({ratingSummary.totalReviews.toLocaleString()} reviews)
                    </p>
                  </div>
                  <span className="rating-label">{ratingSummary.label}</span>
                </div>
              </div>
              <div className="hero-purchase">
                <GamePurchaseCard
                  pricing={displayPricing}
                  ratingSummary={ratingSummary}
                  gameId={data.game.gameId}
                  gameTitle={data.game.title}
                  coverUrl={data.game.cover?.url}
                />
              </div>
            </div>
            <GameQuickInfoTiles tiles={quickInfoTiles} />
          </div>
        </div>

        <GameStickyTabs tabs={tabs} />

        <section className="game-details-section">
          <div className="details-grid">
            <div className="details-main">
              <AboutGameCard
                descriptionMarkdown={data.game.descriptionMarkdown}
                features={data.game.keyFeatures}
                awards={data.game.awards}
              />
              <GameplayCard trailer={trailer} screenshots={screenshots} />
              <GameDetailsCard details={detailRows} />
              <SystemRequirementsCard requirements={data.game.systemRequirements} />
            </div>
            <aside className="details-sidebar">
              <EditionSelector
                editions={data.game.editions}
                selectedId={selectedEditionId}
                onSelect={setSelectedEditionId}
              />
              <DLCList items={data.game.dlcItems} />
              <DeveloperPublisherCard items={developerPublisher} />
            </aside>
          </div>
        </section>

        <section className="game-details-section" id="reviews">
          <div className="reviews-header">
            <h2>Reviews</h2>
            <div className="reviews-controls">
              <div className="controls-row">
                <select
                  className="input"
                  aria-label="Sort reviews"
                  value={reviewFilters.sort ?? 'createdAt:desc'}
                  onChange={(event) => setReviewFilters((prev) => ({ ...prev, sort: event.target.value }))}
                >
                  <option value="createdAt:desc">Newest</option>
                  <option value="helpful:desc">Top</option>
                  <option value="createdAt:desc">Verified purchases</option>
                </select>
                <select
                  className="input"
                  aria-label="Filter by rating"
                  value={reviewFilters.rating ?? ''}
                  onChange={(event) =>
                    setReviewFilters((prev) => ({ ...prev, rating: event.target.value ? Number(event.target.value) : undefined }))
                  }
                >
                  <option value="">All ratings</option>
                  <option value="5">5 stars</option>
                  <option value="4">4 stars</option>
                  <option value="3">3 stars</option>
                  <option value="2">2 stars</option>
                  <option value="1">1 star</option>
                </select>
                <label className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(reviewFilters.withPlaytime)}
                    onChange={(event) => setReviewFilters((prev) => ({ ...prev, withPlaytime: event.target.checked }))}
                  />
                  Only with gameplay time
                </label>
                <label className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(reviewFilters.withImages)}
                    onChange={(event) => setReviewFilters((prev) => ({ ...prev, withImages: event.target.checked }))}
                  />
                  Only with images
                </label>
              </div>
              <div className="controls-row search-row">
                <input
                  className="input"
                  placeholder="Search reviews..."
                  aria-label="Search reviews"
                  value={reviewFilters.q ?? ''}
                  onChange={(event) => setReviewFilters((prev) => ({ ...prev, q: event.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="reviews-grid">
            <ReviewsSummary
              ratingSummary={ratingSummary}
              breakdown={ratingBreakdown}
              tags={reviewTags}
            />
            <ReviewList
              reviews={reviews}
              onHelpful={async (reviewId) => {
                const response = await gameDetailsService.toggleHelpful(reviewId);
                setReviews((prev) =>
                  prev.map((review) =>
                    review.id === reviewId ? { ...review, helpfulCount: response.count } : review
                  )
                );
              }}
              onReport={async (reviewId) => {
                await gameDetailsService.reportReview(reviewId);
              }}
              canInteract={isAuthenticated}
            />
          </div>
          <div className="reviews-lower-grid">
            <WriteReviewCard
              isAuthenticated={isAuthenticated}
              onSubmit={async (payload) => {
                if (!data?.game?.gameId) return;
                await gameDetailsService.createReview(data.game.gameId, { ...payload, recommend: payload.recommend });
                setReviewFilters((prev) => ({ ...prev }));
              }}
            />
            <QASection
              items={questions}
              onAsk={async (question) => {
                if (!data?.game?.gameId || !question.trim()) return;
                await gameDetailsService.askQuestion(data.game.gameId, question.trim());
                setQuestions((prev) => [
                  {
                    id: `temp-${Date.now()}`,
                    question: question.trim(),
                    createdAt: 'Just now'
                  },
                  ...prev
                ]);
              }}
              canAsk={isAuthenticated}
            />
          </div>
          <RecommendationsCarousel items={data.recommendations.moreLikeThis ?? []} />
        </section>
      </div>
    </main>
  );
};

export default GameDetailsPage;
