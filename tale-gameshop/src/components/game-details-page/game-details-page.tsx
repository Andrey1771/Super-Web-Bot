import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { GameDetailsViewModel } from '../../models/game-details';
import type { IGameDetailsService } from '../../iterfaces/i-game-details-service';
import GameMediaGallery from './components/game-media-gallery';
import GamePurchaseCard from './components/game-purchase-card';
import GameQuickInfoTiles from './components/game-quick-info-tiles';
import GameStickyTabs from './components/game-sticky-tabs';
import AboutGameCard from './components/about-game-card';
import GameplayCard from './components/gameplay-card';
import GameDetailsCard from './components/game-details-card';
import EditionSelector from './components/edition-selector';
import DLCList from './components/dlc-list';
import DeveloperPublisherCard from './components/developer-publisher-card';
import ReviewsSummary from './components/reviews-summary';
import ReviewList from './components/review-list';
import WriteReviewCard from './components/write-review-card';
import QASection from './components/qa-section';
import RecommendationsCarousel from './components/recommendations-carousel';
import SystemRequirementsCard from './components/system-requirements-card';
import RatingStars from './components/rating-stars';
import './game-details-page.css';

const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'gameplay', label: 'Gameplay' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'system-requirements', label: 'System requirements' },
    { id: 'dlc-editions', label: 'DLC & editions' }
];

const GameDetailsPage: React.FC = () => {
    const { slug } = useParams();
    const [viewModel, setViewModel] = useState<GameDetailsViewModel | null>(null);
    const [selectedMediaId, setSelectedMediaId] = useState<string>('');
    const [selectedEditionId, setSelectedEditionId] = useState<string>('');
    const [activeTab, setActiveTab] = useState<string>('overview');
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const detailsService = container.get<IGameDetailsService>(IDENTIFIERS.IGameDetailsService);

    useEffect(() => {
        const loadDetails = async () => {
            const data = await detailsService.getGameDetailsBySlug(slug ?? '');
            setViewModel(data);
            setSelectedMediaId(data.heroMedia[0]?.id ?? '');
            setSelectedEditionId(data.editions[0]?.id ?? '');
        };
        loadDetails();
    }, [detailsService, slug]);

    useEffect(() => {
        const sections = tabs
            .map((tab) => sectionRefs.current[tab.id])
            .filter((section): section is HTMLElement => Boolean(section));

        if (!sections.length) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveTab(entry.target.id);
                    }
                });
            },
            { rootMargin: '-140px 0px -65% 0px', threshold: 0.2 }
        );

        sections.forEach((section) => observer.observe(section));

        return () => observer.disconnect();
    }, [viewModel]);

    const selectedEdition = useMemo(() => {
        return viewModel?.editions.find((edition) => edition.id === selectedEditionId) ?? viewModel?.editions[0];
    }, [selectedEditionId, viewModel]);

    const handleTabSelect = (tabId: string) => {
        const target = sectionRefs.current[tabId];
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    if (!viewModel) {
        return (
            <main className="container gd-loading">
                <p>Loading game details...</p>
            </main>
        );
    }

    const pricing = selectedEdition?.pricing ?? viewModel.heroPricing;

    return (
        <main className="game-details-page">
            <div className="container gd-container">
                <section className="gd-hero">
                    <div className="gd-hero-left">
                        <GameMediaGallery
                            mediaItems={viewModel.heroMedia}
                            selectedId={selectedMediaId}
                            onSelect={setSelectedMediaId}
                        />
                    </div>
                    <div className="gd-hero-right">
                        <nav className="gd-breadcrumb" aria-label="Breadcrumb">
                            Store / Games / <span>{viewModel.game.title}</span>
                        </nav>
                        <h1 className="gd-title" title={viewModel.game.title}>{viewModel.game.title}</h1>
                        <p className="gd-tagline">{viewModel.game.tagline}</p>
                        <div className="gd-badges">
                            {viewModel.badges.map((badge) => (
                                <span key={badge} className="gd-chip">{badge}</span>
                            ))}
                        </div>
                        <div className="gd-meta">
                            <div className="gd-meta-row">
                                <span>Developer</span>
                                <strong>{viewModel.game.developer}</strong>
                            </div>
                            <div className="gd-meta-row">
                                <span>Publisher</span>
                                <strong>{viewModel.game.publisher}</strong>
                            </div>
                            <div className="gd-meta-row">
                                <span>Release date</span>
                                <strong>{viewModel.game.releaseDate}</strong>
                            </div>
                            <div className="gd-meta-row">
                                <span>Platforms</span>
                                <div className="gd-chip-row">
                                    {viewModel.game.platforms.map((platform) => (
                                        <span key={platform} className="gd-chip">{platform}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="gd-meta-row">
                                <span>Genres</span>
                                <div className="gd-chip-row">
                                    {viewModel.game.genres.map((genre) => (
                                        <span key={genre} className="gd-chip">{genre}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="gd-rating-card card">
                            <div className="gd-rating-score">{viewModel.ratingSummary.score.toFixed(1)}</div>
                            <div>
                                <RatingStars rating={viewModel.ratingSummary.score} />
                                <span className="gd-rating-count">({viewModel.ratingSummary.reviewCount.toLocaleString()} reviews)</span>
                                <div className="gd-rating-label">{viewModel.ratingSummary.label}</div>
                            </div>
                        </div>
                        <GamePurchaseCard pricing={pricing} ratingSummary={viewModel.ratingSummary} />
                        <GameQuickInfoTiles tiles={viewModel.quickInfo} />
                    </div>
                </section>

                <GameStickyTabs tabs={tabs} activeId={activeTab} onSelect={handleTabSelect} />

                <section className="gd-content">
                    <div className="gd-main">
                        <section id="overview" ref={(node) => (sectionRefs.current.overview = node)}>
                            <AboutGameCard
                                paragraphs={viewModel.about.paragraphs}
                                features={viewModel.about.features}
                                awards={viewModel.about.awards}
                            />
                        </section>
                        <section id="gameplay" ref={(node) => (sectionRefs.current.gameplay = node)}>
                            <GameplayCard trailer={viewModel.gameplay.trailer} screenshots={viewModel.gameplay.screenshots} />
                        </section>
                        <section id="details">
                            <GameDetailsCard
                                genres={viewModel.details.genres}
                                themes={viewModel.details.themes}
                                modes={viewModel.details.modes}
                                tags={viewModel.details.tags}
                                supportedLanguages={viewModel.details.supportedLanguages}
                                cloudSaves={viewModel.details.cloudSaves}
                            />
                        </section>
                        <section id="reviews" ref={(node) => (sectionRefs.current.reviews = node)}>
                            <div className="gd-reviews-header">
                                <h2>Reviews</h2>
                                <div className="gd-reviews-controls">
                                    <select aria-label="Sort reviews">
                                        <option>Newest</option>
                                        <option>Top</option>
                                        <option>Verified purchases</option>
                                    </select>
                                    <select aria-label="Star rating filter">
                                        <option>All ratings</option>
                                        <option>5 stars</option>
                                        <option>4 stars</option>
                                        <option>3 stars</option>
                                        <option>2 stars</option>
                                        <option>1 star</option>
                                    </select>
                                    <label className="gd-checkbox">
                                        <input type="checkbox" />
                                        Only with gameplay time
                                    </label>
                                    <label className="gd-checkbox">
                                        <input type="checkbox" />
                                        Only with images
                                    </label>
                                    <div className="gd-search">
                                        <input type="search" placeholder="Search reviews..." aria-label="Search reviews" />
                                    </div>
                                </div>
                            </div>
                            <div className="gd-reviews-layout">
                                <ReviewsSummary summary={viewModel.ratingSummary} />
                                <ReviewList reviews={viewModel.reviews} />
                            </div>
                            <div className="gd-reviews-bottom">
                                <WriteReviewCard isLoggedIn={false} />
                                <QASection items={viewModel.qa} />
                            </div>
                            <RecommendationsCarousel title="More like this" items={viewModel.recommendations} />
                            <RecommendationsCarousel title="Recently viewed" items={viewModel.recentlyViewed} />
                        </section>
                        <section id="system-requirements" ref={(node) => (sectionRefs.current['system-requirements'] = node)}>
                            <SystemRequirementsCard
                                minimum={viewModel.systemRequirements.minimum}
                                recommended={viewModel.systemRequirements.recommended}
                            />
                        </section>
                    </div>
                    <aside className="gd-sidebar">
                        <section id="dlc-editions" ref={(node) => (sectionRefs.current['dlc-editions'] = node)}>
                            <EditionSelector
                                editions={viewModel.editions}
                                selectedId={selectedEditionId}
                                onChange={setSelectedEditionId}
                            />
                            <DLCList items={viewModel.dlc} />
                        </section>
                        <DeveloperPublisherCard
                            info={viewModel.developerPublisher}
                            developerName={viewModel.game.developer}
                            publisherName={viewModel.game.publisher}
                        />
                    </aside>
                </section>
            </div>
        </main>
    );
};

export default GameDetailsPage;
