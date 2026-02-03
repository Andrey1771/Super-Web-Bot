import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './game-details-page.css';
import { gameDetailsService } from '../../services/game-details-service';
import {
  DetailRow,
  DLC,
  Edition,
  GameCardItem,
  GameDetailsViewModel,
  MediaItem,
  QAItem,
  QuickInfoTile,
  RatingBreakdownItem,
  Review,
  ReviewTag,
  SystemRequirement
} from '../../types/game-details';
import IDENTIFIERS from '../../constants/identifiers';
import container from '../../inversify.config';
import type { IKeycloakService } from '../../iterfaces/i-keycloak-service';

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

const GameMediaGallery = ({ media, title }: { media: MediaItem[]; title: string }) => {
  const [selectedId, setSelectedId] = useState(media[0]?.id ?? '');
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
    const node = thumbnailRef.current;
    if (!node) return;
    const handleScroll = () => updateScrollState();
    node.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', updateScrollState);
    return () => {
      node.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [media.length]);

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
            <video controls poster={selectedMedia.thumbUrl} aria-label={`${title} trailer`}>
              <source src={selectedMedia.url} />
            </video>
          </div>
        ) : (
          <div className="game-media-image">
            <img src={selectedMedia?.url} alt={`${title} cover`} />
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
              <img src={item.thumbUrl} alt={`${title} preview`} loading="lazy" />
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
  ratingSummary
}: {
  pricing: { price: number; oldPrice?: number; currency: string; discountPercent?: number };
  ratingSummary: { average: number; totalReviews: number; label: string };
}) => {
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
      </div>
      <div className="purchase-actions">
        <button className="btn btn-primary" type="button">
          Add to cart
        </button>
        <button className="btn btn-outline" type="button">
          Wishlist
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

const AboutGameCard = ({ description, features, awards }: { description: string[]; features: string[]; awards: string[] }) => (
  <div className="card" id="overview">
    <h2>About this game</h2>
    {description.map((paragraph) => (
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
          <span key={award} className="award-pill">
            🏆 {award}
          </span>
        ))}
      </div>
    </div>
  </div>
);

const GameplayCard = ({ trailerUrl, screenshots }: { trailerUrl: string; screenshots: string[] }) => {
  const [activeShot, setActiveShot] = useState<string | null>(null);

  return (
    <div className="card" id="gameplay">
      <h2>Gameplay & trailer</h2>
      <div className="video-card">
        <div className="video-frame">
          <video controls poster={screenshots[0]} aria-label="Official gameplay trailer">
            <source src={trailerUrl} />
          </video>
          <span className="video-label">Official Gameplay Trailer</span>
        </div>
      </div>
      <div className="screenshot-grid">
        {screenshots.map((shot) => (
          <button
            key={shot}
            type="button"
            className="screenshot-item"
            onClick={() => setActiveShot(shot)}
            aria-label="Open screenshot"
          >
            <img src={shot} alt="Gameplay screenshot" loading="lazy" />
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

const SystemRequirementsCard = ({ requirements }: { requirements: SystemRequirement[] }) => (
  <div className="card" id="system-requirements">
    <h2>System requirements</h2>
    <div className="detail-rows">
      {requirements.map((req) => (
        <div key={req.id} className="detail-row">
          <span className="detail-label">{req.label}</span>
          <span className="detail-value">{req.value}</span>
        </div>
      ))}
    </div>
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
        <label key={edition.id} className={`edition-item ${selectedId === edition.id ? 'is-active' : ''}`}>
          <input
            type="radio"
            name="edition"
            checked={selectedId === edition.id}
            onChange={() => onSelect(edition.id)}
          />
          <div>
            <p className="edition-name">{edition.name}</p>
            <p className="edition-description">{edition.description}</p>
          </div>
          <div className="edition-pricing">
            <span className="edition-price">{formatPrice(edition.pricing.price, edition.pricing.currency)}</span>
            {edition.pricing.oldPrice && (
              <span className="edition-old">
                {formatPrice(edition.pricing.oldPrice, edition.pricing.currency)}
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
          <img src={dlc.coverUrl} alt={`${dlc.title} cover`} />
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

const ReviewCard = ({ review }: { review: Review }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card review-card">
      <div className="review-header">
        <div className="review-user">
          <img src={review.avatarUrl} alt={review.userName} />
          <div>
            <p className="review-name">{review.userName}</p>
            {review.verified && <span className="verified">Verified purchase</span>}
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
      {review.screenshotUrl && (
        <img className="review-shot" src={review.screenshotUrl} alt="Review screenshot" loading="lazy" />
      )}
      <div className="review-actions">
        <button type="button" className="btn btn-ghost" disabled title="Coming soon">
          👍 Helpful ({review.helpfulCount})
        </button>
        <button type="button" className="btn btn-ghost" disabled title="Coming soon">
          Report
        </button>
      </div>
    </div>
  );
};

const ReviewList = ({ reviews }: { reviews: Review[] }) => (
  <div className="review-list">
    {reviews.map((review) => (
      <ReviewCard key={review.id} review={review} />
    ))}
  </div>
);

const WriteReviewCard = ({ isAuthenticated }: { isAuthenticated: boolean }) => (
  <div className="card write-review">
    <h2>Write a review</h2>
    {!isAuthenticated && <p className="muted">Sign in to leave a review</p>}
    <div className="write-stars" aria-label="Select rating">
      {Array.from({ length: 5 }).map((_, index) => (
        <button key={index} type="button" className="star-button" disabled={!isAuthenticated}>
          ★
        </button>
      ))}
    </div>
    <textarea
      className="input review-textarea"
      placeholder="Share your experience..."
      disabled={!isAuthenticated}
    />
    <div className="write-review-actions">
      <button type="button" className="btn btn-outline" disabled={!isAuthenticated}>
        Add images
      </button>
      <label className="checkbox-row">
        <input type="checkbox" disabled={!isAuthenticated} />
        I recommend this game
      </label>
    </div>
    <button type="button" className="btn btn-primary" disabled={!isAuthenticated}>
      Submit
    </button>
  </div>
);

const QASection = ({ items }: { items: QAItem[] }) => (
  <div className="card qa-section">
    <div className="qa-header">
      <h2>Q & A</h2>
      <button type="button" className="btn btn-outline" disabled title="Coming soon">
        Ask a question
      </button>
    </div>
    <div className="qa-list">
      {items.map((item) => (
        <div key={item.id} className="qa-item">
          <p className="qa-question">{item.question}</p>
          <p className="qa-answer">{item.answer}</p>
          <span className="qa-date">{item.createdAt}</span>
        </div>
      ))}
    </div>
  </div>
);

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
          <Link key={item.id} to={`/games/${item.slug}`} className="recommendation-card">
            <img src={item.coverUrl} alt={item.title} loading="lazy" />
            <div>
              <p className="line-clamp-2">{item.title}</p>
              <div className="recommendation-meta">
                <span>{formatPrice(item.price, 'USD')}</span>
                <span className="recommendation-rating">★ {item.rating.toFixed(1)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

const GameDetailsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<GameDetailsViewModel | null>(null);
  const [selectedEditionId, setSelectedEditionId] = useState('');

  const keycloakService = useMemo(
    () => container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService),
    []
  );

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      const response = await gameDetailsService.getGameDetails(slug ?? '');
      if (isMounted) {
        setData(response);
        if (response.editions.length > 0) {
          setSelectedEditionId(response.editions[0].id);
        }
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  const selectedEdition = data?.editions.find((edition) => edition.id === selectedEditionId);
  const displayPricing = selectedEdition?.pricing ?? data?.pricing;
  const isAuthenticated = Boolean(keycloakService.keycloak?.authenticated);

  if (!data || !displayPricing) {
    return (
      <main className="game-details-page">
        <div className="container">
          <p>Loading game details...</p>
        </div>
      </main>
    );
  }

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
            <GameMediaGallery media={data.media} title={data.game.title} />
          </div>
          <div className="hero-right">
            <nav className="breadcrumbs">
              <Link to="/">Store</Link>
              <span>/</span>
              <Link to="/games">Games</Link>
              <span>/</span>
              <span className="current">{data.game.title}</span>
            </nav>
            <h1 className="game-title line-clamp-2">{data.game.title}</h1>
            <p className="game-tagline">{data.game.tagline}</p>
            <div className="badge-row">
              {['Top rated', 'New', `-${displayPricing.discountPercent ?? 0}%`, 'Steam key'].map((badge) => (
                <span key={badge} className="badge">
                  {badge}
                </span>
              ))}
            </div>
            <div className="meta-list">
              <div>
                <span className="meta-label">Developer</span>
                <span>{data.game.developer}</span>
              </div>
              <div>
                <span className="meta-label">Publisher</span>
                <span>{data.game.publisher}</span>
              </div>
              <div>
                <span className="meta-label">Release date</span>
                <span>{data.game.releaseDate}</span>
              </div>
              <div>
                <span className="meta-label">Platforms</span>
                <div className="chip-row">
                  {data.game.platforms.map((platform) => (
                    <span key={platform} className="chip">
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
            <div className="rating-summary card">
              <div className="rating-score">
                <span>{data.ratingSummary.average.toFixed(1)}</span>
              </div>
              <div>
                <StarRating rating={data.ratingSummary.average} />
                <p>
                  ({data.ratingSummary.totalReviews.toLocaleString()} reviews) · {data.ratingSummary.label}
                </p>
              </div>
            </div>
            <GamePurchaseCard pricing={displayPricing} ratingSummary={data.ratingSummary} />
            <GameQuickInfoTiles tiles={data.quickInfoTiles} />
          </div>
        </div>

        <GameStickyTabs tabs={tabs} />

        <section className="game-details-section">
          <div className="details-grid">
            <div className="details-main">
              <AboutGameCard
                description={data.game.description}
                features={data.game.features}
                awards={data.game.awards}
              />
              <GameplayCard trailerUrl={data.trailerUrl} screenshots={data.screenshotGallery} />
              <GameDetailsCard details={data.detailRows} />
              <SystemRequirementsCard requirements={data.systemRequirements} />
            </div>
            <aside className="details-sidebar">
              <EditionSelector
                editions={data.editions}
                selectedId={selectedEditionId}
                onSelect={setSelectedEditionId}
              />
              <DLCList items={data.dlc} />
              <DeveloperPublisherCard items={data.developerPublisher} />
            </aside>
          </div>
        </section>

        <section className="game-details-section" id="reviews">
          <div className="reviews-header">
            <h2>Reviews</h2>
            <div className="reviews-controls">
              <select className="input" aria-label="Sort reviews">
                <option>Newest</option>
                <option>Top</option>
                <option>Verified purchases</option>
              </select>
              <select className="input" aria-label="Filter by rating">
                <option>All ratings</option>
                <option>5 stars</option>
                <option>4 stars</option>
                <option>3 stars</option>
                <option>2 stars</option>
                <option>1 star</option>
              </select>
              <label className="filter-checkbox">
                <input type="checkbox" />
                Only with gameplay time
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" />
                Only with images
              </label>
              <input className="input" placeholder="Search reviews..." aria-label="Search reviews" />
            </div>
          </div>
          <div className="reviews-grid">
            <ReviewsSummary
              ratingSummary={data.ratingSummary}
              breakdown={data.ratingBreakdown}
              tags={data.reviewTags}
            />
            <ReviewList reviews={data.reviews} />
          </div>
          <div className="reviews-lower-grid">
            <WriteReviewCard isAuthenticated={isAuthenticated} />
            <QASection items={data.qa} />
          </div>
          <RecommendationsCarousel items={data.recommendations} />
        </section>
      </div>
    </main>
  );
};

export default GameDetailsPage;
