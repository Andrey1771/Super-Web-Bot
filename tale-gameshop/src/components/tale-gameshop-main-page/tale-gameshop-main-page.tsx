import React, {
    useEffect,
    useMemo,
    useState
} from "react";
import "./tale-gameshop-main-page.css";
import "../../font-awesome.ts";
import {
    FontAwesomeIcon
} from "@fortawesome/react-fontawesome";
import {
    faArrowRight,
    faBolt,
    faCheckCircle,
    faChessKnight,
    faChevronDown,
    faEnvelope,
    faHatWizard,
    faLeaf,
    faPuzzlePiece,
    faShieldAlt,
    faUsers
} from "@fortawesome/free-solid-svg-icons";
import container from "../../inversify.config";
import type {
    IApiClient
} from "../../iterfaces/i-api-client";
import type {
    IBlogService
} from "../../iterfaces/i-blog-service";
import IDENTIFIERS from "../../constants/identifiers";
import {
    Game
} from "../../models/game";
import {
    Link
} from "react-router-dom";
import {
    IUrlService
} from "../../iterfaces/i-url-service";
import SafeGameImage from "../common/SafeGameImage";
import TestimonialsCarousel from "../testimonials/TestimonialsCarousel";
import FeaturedStorefrontSection from "../featured-storefront/FeaturedStorefrontSection";
import type {
    BlogListItem
} from "../../types/blog";
import { slugify } from "../../utils/slugify";
export default function TaleGameshopMainPage() {
    const [games, setGames] = useState < Game[] > ([]);
    const [blogPosts, setBlogPosts] = useState < BlogListItem[] > ([]);
    const [blogLoading, setBlogLoading] = useState(true);
    const [openFaqIndex, setOpenFaqIndex] = useState(0);
    const [heroIndex, setHeroIndex] = useState(0);
    const [heroDirection, setHeroDirection] = useState<"next" | "prev">("next");
    const [isHeroAnimating, setIsHeroAnimating] = useState(false);
    const urlService = container.get < IUrlService > (IDENTIFIERS.IUrlService);
    useEffect(() => {
        fetchGames();
    }, []);
    useEffect(() => {
        fetchBlogPosts();
    }, []);
    const fetchGames = async () => {
        try {
            const apiClient = container.get < IApiClient > (IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get("/api/game");
            const items: Game[] = response.data;
            if (!items || items.length === 0) {
                throw new Error("No games found");
            }
            setGames(items);
        } catch (err) {
            //
        }
    };

    const fetchBlogPosts = async () => {
        try {
            setBlogLoading(true);
            const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
            const response = await blogService.getPosts({ page: 1, pageSize: 5 });
            setBlogPosts(response.items);
        } catch (err) {
            console.error(err);
            setBlogPosts([]);
        } finally {
            setBlogLoading(false);
        }
    };

    const heroGames = useMemo(() => {
        return [...games].sort((a, b) => {
            const dateA = Date.parse(a.releaseDate || "");
            const dateB = Date.parse(b.releaseDate || "");
            return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
        });
    }, [games]);

    useEffect(() => {
        if (heroGames.length === 0) {
            setHeroIndex(0);
            return;
        }

        setHeroIndex((prev) => (prev >= heroGames.length ? 0 : prev));
    }, [heroGames.length]);

    useEffect(() => {
        if (heroGames.length <= 1) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setHeroDirection("next");
            setHeroIndex((prev) => (prev + 1) % heroGames.length);
        }, 6500);

        return () => window.clearInterval(intervalId);
    }, [heroGames.length]);

    const heroPrimary = heroGames[heroIndex] ?? null;

    useEffect(() => {
        if (!heroGames.length) {
            setIsHeroAnimating(false);
            return;
        }
        setIsHeroAnimating(true);
        const timeoutId = window.setTimeout(() => setIsHeroAnimating(false), 480);
        return () => window.clearTimeout(timeoutId);
    }, [heroGames.length, heroIndex]);

    const getGameHref = (game: Game) => {
        const fallbackSlug = slugify(game.slug?.trim() || game.title || game.name || "game");
        return `/games/${fallbackSlug}`;
    };

    const getHeroPrice = (game: Game) => {
        if (Number.isFinite(game.finalPrice ?? NaN)) {
            return Number(game.finalPrice);
        }
        return Number.isFinite(game.price) ? Number(game.price) : 0;
    };

    const formatHeroPrice = (price: number) => `$${price.toFixed(2)}`;

    const goToNextHero = () => {
        if (heroGames.length <= 1) {
            return;
        }
        setHeroDirection("next");
        setHeroIndex((prev) => (prev + 1) % heroGames.length);
    };

    const goToPrevHero = () => {
        if (heroGames.length <= 1) {
            return;
        }
        setHeroDirection("prev");
        setHeroIndex((prev) => (prev - 1 + heroGames.length) % heroGames.length);
    };

    const isLoading = games.length === 0;
    const perks = ["Secure payments", "Instant delivery", "Curated picks"];
const genres = [ { title: "Action", description: "High-impact firefights and fast pacing.", icon: faBolt }, { title: "Puzzle", description: "Brain-teasing challenges to unwind.", icon: faPuzzlePiece }, { title: "RPG", description: "Deep stories with character growth.", icon: faHatWizard }, { title: "Strategy", description: "Command, conquer, and outthink.", icon: faChessKnight }, { title: "Indie", description: "Curated gems from small teams.", icon: faLeaf }, { title: "Co-op", description: "Jump in together and beat the odds.", icon: faUsers } ]; const featuredBlogPosts = useMemo(() => blogPosts.slice(0, 3), [blogPosts]); const highlightPosts = useMemo(() => { const highlights = blogPosts.slice(3, 5); return highlights.length ? highlights : blogPosts.slice(0, 2); }, [blogPosts]); const blogFallbackCover = "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=800&q=80"; const reasons = [ { title: "Secure payments", description: "Protected checkout with trusted partners.", icon: faCheckCircle }, { title: "Instant delivery", description: "Receive your key moments after purchase.", icon: faBolt }, { title: "Curated picks", description: "Hand-selected games for every mood.", icon: faHatWizard }, { title: "Friendly support", description: "Here to help with installs and access.", icon: faUsers } ]; const steps = [ { label: "Choose a game", helper: "Browse curated genres and picks." }, { label: "Pay securely", helper: "Checkout with verified payments." }, { label: "Get your key / download", helper: "Instant email delivery and quick access." } ]; const testimonials = [ { quote: "Instant delivery and great picks. Every purchase has been smooth and fast.", name: "Alex P.", role: "Verified buyer", badge: "Verified purchase" }, { quote: "Love the curated lists—found hidden gems I never would have tried.", name: "Maria K.", role: "Longtime customer", badge: "Verified purchase" }, { quote: "Checkout feels secure and the keys arrive immediately. Support is friendly too.", name: "Samir L.", role: "Verified buyer", badge: "Verified purchase" } ]; const trustPoints = [ { icon: faShieldAlt, title: "Secure checkout" }, { icon: faBolt, title: "Instant email delivery" }, { icon: faCheckCircle, title: "Refund policy" }, { icon: faUsers, title: "Friendly support" }, { icon: faHatWizard, title: "Verified payments" } ]; const faqs = [ { question: "How do I receive my key?", answer: "Keys are delivered instantly to your email and visible in your account after checkout." }, { question: "What payment methods do you support?", answer: "We support major cards and verified processors for secure payments." }, { question: "Can I request a refund?", answer: "Yes. If you experience an issue with your key or access, reach out and we will help." }, { question: "Is the delivery instant?", answer: "Delivery is typically instant. Most purchases reach your inbox within seconds." }, { question: "Do you support EN/RU?", answer: "We provide support in EN and RU, and the catalog lists language availability per game." } ]; const toggleFaq = (index: number) => {
        setOpenFaqIndex((prev) => (prev === index ? -1 : index));
    };

    const renderHeroSlide = (game: Game) => {
        const href = getGameHref(game);
        const price = formatHeroPrice(getHeroPrice(game));

        return (
            <div className="hero-carousel hero-card">
                <Link
                    to={href}
                    className="hero-card-link hero-carousel-link"
                    aria-label={`Open game ${game.title}`}
                >
                    <div className="hero-carousel-track">
                        <div className="hero-media">
                        <SafeGameImage gameTitle={game.title} src={game.imagePath} baseUrl={urlService.apiBaseUrl} />
                        </div>
                    </div>
                    <div className="hero-overlay hero-overlay-large">
                        <span className="hero-title hero-title-large">{game.title}</span>
                        <span className="hero-price">{price}</span>
                    </div>
                </Link>

                {heroGames.length > 1 && (
                    <>
                        <button
                            type="button"
                            className="hero-carousel-hotspot hero-carousel-hotspot-prev"
                            onClick={goToPrevHero}
                            aria-label="Previous game"
                        >
                            <span aria-hidden="true">‹</span>
                        </button>
                        <button
                            type="button"
                            className="hero-carousel-hotspot hero-carousel-hotspot-next"
                            onClick={goToNextHero}
                            aria-label="Next game"
                        >
                            <span aria-hidden="true">›</span>
                        </button>
                    </>
                )}
            </div>
        );
    };

const renderHeroSkeleton = () => (
        <div className="hero-carousel hero-card skeleton-card" aria-hidden="true">
            <div className="hero-carousel-track">
                <div className="hero-media">
                    <div className="media-placeholder skeleton" />
                </div>
            </div>
            <div className="hero-overlay hero-overlay-large">
                <span className="skeleton-line skeleton" />
                <span className="skeleton-line skeleton-line-short skeleton" />
            </div>
        </div>
    );

    return (
        <div className="main-page">
            <section className="hero">
                <div className="container hero-grid hero-container">
                    <div className="hero-copy">
                        <div className="eyebrow">PARE GAMES</div>
                        <h1>Discover Your Next Favourite Computer Game</h1>
                        <p className="hero-subtext">
                            A curated marketplace built for PC gamers. Browse premium picks, pay securely, and jump in instantly.
                        </p>
                        <div className="hero-perks">
                            {perks.map((perk) => (
                                <div className="hero-perk" key={perk}>
                                    <FontAwesomeIcon icon={faCheckCircle} />
                                    <span>{perk}</span>
                                </div>
                            ))}
                        </div>
                        <div className="hero-actions">
                            <Link to="/games" className="btn btn-primary">Shop</Link>
                            <Link to="/about" className="btn btn-outline">Learn more</Link>
                        </div>
                    </div>

                    <div className="hero-showcase">
                        {isLoading ? (
                            renderHeroSkeleton()
                        ) : heroPrimary ? (
                            <div className="hero-carousel-module">
                                <div
                                    className={[
                                        "hero-carousel-stage",
                                        isHeroAnimating ? "hero-carousel-stage-is-animating" : "",
                                        isHeroAnimating ? `hero-carousel-stage-${heroDirection}` : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                >
                                    {renderHeroSlide(heroPrimary)}
                                </div>
                            </div>
                        ) : (
                            renderHeroSkeleton()
                        )}
                    </div>
                </div>
            </section>

            <FeaturedStorefrontSection games={games} isLoading={isLoading} /> <section className="explore-blog-section"> <div className="container"> <div className="explore-grid"> <div className="explore-column"> <div className="column-header"> <h3>Explore our games</h3> <p className="muted">Genres curated for every kind of player.</p> </div> <div className="genre-grid"> {genres.map((genre) => ( <div className="genre-card" key={genre.title}> <div className="genre-icon"> <FontAwesomeIcon icon={genre.icon} /> </div> <div className="genre-copy"> <div className="genre-title">{genre.title}</div> <div className="genre-description muted">{genre.description}</div> </div> <Link className="genre-link" to={`/games?filterCategory=${genre.title}`}> View </Link> </div> ))} </div> <Link className="btn btn-outline full-width" to="/games"> Browse all genres </Link> </div> <div className="explore-column"> <div className="column-header"> <h3>Latest blog posts</h3> <p className="muted">Fresh drops from our editorial team.</p> </div> <div className="blog-list"> {blogLoading ? ( Array.from({ length: 3 }).map((_, index) => ( <div className="blog-item" key={`blog-skeleton-${index}`}> <div className="blog-thumb skeleton" aria-hidden="true" /> <div className="blog-copy"> <div className="skeleton h-5" /> <div className="skeleton h-4 mt-2" /> </div> </div> )) ) : featuredBlogPosts.length === 0 ? ( <div className="muted">Blog posts will appear here once published.</div> ) : ( featuredBlogPosts.map((post) => ( <div className="blog-item" key={post.id}> <div className="blog-thumb" aria-hidden="true" style={{ backgroundImage: `url(${post.coverUrl || blogFallbackCover})` }} /> <div className="blog-copy"> <div className="blog-title">{post.title}</div> <div className="blog-snippet muted">{post.excerpt}</div> </div> <Link className="text-link" to={`/blog/${post.slug}`}> Read </Link> </div> )) )} </div> <Link className="btn btn-ghost" to="/blog"> Go to blog </Link> </div> <div className="explore-column"> <div className="column-header"> <h3>Highlights from blog</h3> <p className="muted">Hand-picked stories worth reading.</p> </div> <div className="highlight-stack"> {blogLoading ? ( Array.from({ length: 2 }).map((_, index) => ( <div className="highlight-card" key={`highlight-skeleton-${index}`}> <div className="highlight-media skeleton" aria-hidden="true" /> <div className="highlight-body"> <div className="skeleton h-4 w-24" /> <div className="skeleton h-5 mt-2" /> <div className="skeleton h-4 mt-2" /> </div> </div> )) ) : highlightPosts.length === 0 ? ( <div className="muted">Check back soon for highlight stories.</div> ) : ( highlightPosts.map((item, index) => ( <div className="highlight-card" key={item.id}> <div className="highlight-media" aria-hidden="true" style={{ backgroundImage: `url(${item.coverUrl || blogFallbackCover})` }} /> <div className="highlight-body"> <div className="highlight-header"> <span className="highlight-badge"> {item.tags[0] ?? (index === 0 ? "Weekly" : "New")} </span> <Link className="text-link" to={`/blog/${item.slug}`}> Read more </Link> </div> <div className="highlight-title">{item.title}</div> <div className="highlight-snippet muted">{item.excerpt}</div> </div> </div> )) )} </div> </div> </div> </div> </section> <section className="why-section"> <div className="container"> <div className="section-heading"> <h2>Why choose us</h2> <p className="muted">Curated games, secure payments, and delivery in moments.</p> </div> <div className="why-grid"> {reasons.map((reason) => ( <div className="why-card" key={reason.title}> <div className="why-icon"> <FontAwesomeIcon icon={reason.icon} /> </div> <div className="why-copy"> <div className="why-title">{reason.title}</div> <div className="why-description muted">{reason.description}</div> </div> </div> ))} </div> </div> </section> <section className="how-section"> <div className="container"> <div className="section-heading"> <h2>How it works</h2> <p className="muted">Three simple steps from browsing to playing.</p> </div> <div className="steps-grid"> {steps.map((step, index) => ( <div className="step-card" key={step.label}> <div className="step-marker">{index + 1}</div> <div className="step-body"> <div className="step-title">{step.label}</div> <div className="step-helper muted">{step.helper}</div> </div> </div> ))} </div> <div className="trust-row muted"> Refund policy • Verified payments • Instant email delivery </div> </div> </section> <section className="cta-section"> <div className="container"> <div className="cta-card"> <div className="cta-copy"> <h3>Ready to explore the Store?</h3> <p className="muted">Discover the full catalog and weekly deals.</p> </div> <div className="cta-actions"> <Link to="/games" className="btn btn-primary"> Go to Store </Link> <Link to="/games" className="btn btn-outline"> Browse genres </Link> </div> </div> </div> </section> <TestimonialsCarousel testimonials={testimonials} /> <section className="trust-section"> <div className="container"> <div className="trust-heading"> <h3>Trusted payment & delivery</h3> </div> <div className="trust-items"> {trustPoints.map((point) => ( <div className="trust-item" key={point.title}> <FontAwesomeIcon icon={point.icon} /> <span>{point.title}</span> </div> ))} </div> </div> </section> <section className="newsletter-section"> <div className="container"> <div className="newsletter-card"> <div className="newsletter-copy"> <h3>Get weekly deals & rare picks</h3> <p className="muted">No spam. Unsubscribe anytime.</p> </div> <form className="newsletter-form" onSubmit={(e) => e.preventDefault()}> <div className="input-row"> <div className="input-icon"> <FontAwesomeIcon icon={faEnvelope} /> </div> <input type="email" placeholder="Enter your email" required /> <button className="btn btn-primary" type="submit"> Subscribe </button> </div> <label className="checkbox-row"> <input type="checkbox" defaultChecked /> <span>Notify me about price drops</span> </label> </form> </div> </div> </section> <section className="faq-section"> <div className="container"> <div className="section-heading"> <h3>Quick FAQ</h3> <p className="muted">Answers to common questions about delivery and payments.</p> </div> <div className="faq-list"> {faqs.map((item, index) => ( <div className={`faq-item ${openFaqIndex === index ? "open" : ""}`} key={item.question} > <button className="faq-trigger" onClick={() => toggleFaq(index)}> <span>{item.question}</span> <FontAwesomeIcon icon={faChevronDown} /> </button> {openFaqIndex === index && ( <div className="faq-answer muted">{item.answer}</div> )} </div> ))} </div> </div> </section> <section className="store-prefooter"> <div className="container"> <div className="store-prefooter-card"> <div className="store-prefooter-copy"> <h3>Find your next game today</h3> <p className="muted">Step into the full catalog with weekly deals and curated picks.</p> </div> <div className="store-prefooter-actions"> <Link to="/games" className="btn btn-primary"> Go to Store </Link> <Link to="/games" className="btn btn-outline"> Browse genres </Link> </div> </div> </div> </section> </div> ); }
