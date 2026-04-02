import React, {KeyboardEvent, MouseEvent, useEffect, useMemo, useRef} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faArrowRightLong} from "@fortawesome/free-solid-svg-icons";
import {Link, useNavigate} from "react-router-dom";
import type {BlogListItem} from "../../../types/blog";
import {useBlogTracking} from "../../../hooks/use-blog-tracking";
import SafeBlogImage from "../../../components/blog-page/SafeBlogImage";
import {getBlogPostCoverUrl} from "../../../utils/blog-cover";

type PostCardVariant = "compact" | "featured" | "mini";

type PostCardProps = {
    post: BlogListItem;
    className?: string;
    variant?: PostCardVariant;
    showCategoryBadge?: boolean;
    showFeaturedBadge?: boolean;
    showActions?: boolean;
    onTagSelect?: (tag: string) => void;
    engagement?: { viewsCount?: number; totalReactions?: number; myReaction?: string; reactions?: Record<string, number> };
    onReact?: (postId: string, reaction: string) => void;
};

const formatDate = (value?: string) => {
    if (!value) {
        return "Draft";
    }
    return new Date(value).toLocaleDateString();
};

export default function PostCard({
    post,
    className,
    variant = "compact",
    showCategoryBadge = true,
    showFeaturedBadge = true,
    showActions = true,
    onTagSelect,
    engagement,
    onReact
}: PostCardProps) {
    const {trackImpression, trackOpen} = useBlogTracking();
    const navigate = useNavigate();
    const cardRef = useRef<HTMLElement | null>(null);
    const tag = post.tags[0];
    const isFeatured = variant === "featured";
    const isMini = variant === "mini";
    const titleClamp = useMemo(() => {
        if (isFeatured) {
            return "line-clamp-2";
        }
        if (isMini) {
            return "line-clamp-2";
        }
        return "line-clamp-3";
    }, [isFeatured, isMini]);
    const excerptClamp = isFeatured ? "line-clamp-4" : "line-clamp-3";
    const TitleTag = (isFeatured ? "h2" : isMini ? "h4" : "h3") as React.ElementType;
    const viewsText = typeof engagement?.viewsCount === "number" && engagement.viewsCount > 0 ? `${engagement.viewsCount} views` : "";
    const reactionsText = typeof engagement?.totalReactions === "number" && engagement.totalReactions > 0 ? `${engagement.totalReactions} reactions` : "";
    const reactionOptions = ["👍", "❤️", "🔥", "🎮", "👀"];

    const isInteractiveTarget = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        return Boolean(target.closest("a,button,input,select,textarea,[role='button']"));
    };

    const openPost = () => {
        trackOpen(post.id);
        navigate(`/blog/${post.slug}`);
    };

    const handleCardClick = (event: MouseEvent<HTMLElement>) => {
        if (isInteractiveTarget(event.target)) {
            return;
        }
        openPost();
    };

    const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        if (isInteractiveTarget(event.target)) {
            return;
        }
        event.preventDefault();
        openPost();
    };

    useEffect(() => {
        const node = cardRef.current;
        if (!node) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        trackImpression(post.id);
                        observer.disconnect();
                    }
                });
            },
            {threshold: 0.4}
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [post.id, trackImpression]);

    if (isMini) {
        return (
            <article
                className={`post-card post-card--mini${className ? ` ${className}` : ""}`}
                ref={cardRef}
                role="link"
                tabIndex={0}
                onClick={handleCardClick}
                onKeyDown={handleCardKeyDown}
            >
                <div className="post-card__media post-card__media--mini" aria-hidden="true">
                    <SafeBlogImage src={getBlogPostCoverUrl(post)} alt={post.title} />
                </div>
                <div className="post-card__body post-card__body--mini">
                    <Link className="post-card__title-link" to={`/blog/${post.slug}`} onClick={() => trackOpen(post.id)}>
                        <TitleTag className={`post-card__title ${titleClamp}`}>{post.title}</TitleTag>
                    </Link>
                    <div className="meta-row">
                        <span>{formatDate(post.publishedAt)}</span>
                        {post.readingTime ? (
                            <>
                                <span className="divider-dot" aria-hidden="true">•</span>
                                <span>{`${post.readingTime} min read`}</span>
                            </>
                        ) : null}
                        {viewsText ? (
                            <>
                                <span className="divider-dot" aria-hidden="true">•</span>
                                <span>{viewsText}</span>
                            </>
                        ) : null}
                    </div>
                </div>
            </article>
        );
    }

    return (
        <article
            className={`post-card post-card--${variant}${className ? ` ${className}` : ""}`}
            ref={cardRef}
            role="link"
            tabIndex={0}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
        >
            <div className={`post-card__media post-card__media--${variant}`} aria-hidden="true">
                {showCategoryBadge && tag && !isFeatured && <span className="badge category-badge">{tag}</span>}
                <div className="media-overlay" />
                <SafeBlogImage src={getBlogPostCoverUrl(post)} alt={post.title} />
            </div>
            <div className={`post-card__body post-card__body--${variant}`}>
                <div className={`post-card__content${isFeatured ? " measure-60ch" : ""}`}>
                    {isFeatured && showFeaturedBadge && <span className="badge featured-badge">Featured</span>}
                    <TitleTag className={`post-card__title ${titleClamp}`}>{post.title}</TitleTag>
                    <div className="meta-row">
                        <span>{formatDate(post.publishedAt)}</span>
                        {post.readingTime ? (
                            <>
                                <span className="divider-dot" aria-hidden="true">•</span>
                                <span>{`${post.readingTime} min read`}</span>
                            </>
                        ) : null}
                        {isFeatured && tag && <span className="meta-pill">{tag}</span>}
                        {viewsText ? (
                            <>
                                <span className="divider-dot" aria-hidden="true">•</span>
                                <span>{viewsText}</span>
                            </>
                        ) : null}
                        {reactionsText ? (
                            <>
                                <span className="divider-dot" aria-hidden="true">•</span>
                                <span>{reactionsText}</span>
                            </>
                        ) : null}
                    </div>
                    {!isFeatured && <p className={`post-card__excerpt ${excerptClamp}`}>{post.excerpt}</p>}
                    {isFeatured && <p className={`post-card__excerpt ${excerptClamp}`}>{post.excerpt}</p>}
                    {!isMini && onReact ? (
                        <div className="post-card__reactions" aria-label="Quick reactions">
                            {reactionOptions.map((emoji) => {
                                const count = engagement?.reactions?.[emoji] ?? 0;
                                const isActive = engagement?.myReaction === emoji;
                                return (
                                    <button
                                        key={`${post.id}-${emoji}`}
                                        className={`post-card__reaction-btn ${isActive ? "active" : ""}`}
                                        type="button"
                                        onClick={() => onReact(post.id, emoji)}
                                    >
                                        <span>{emoji}</span>
                                        {count > 0 ? <span>{count}</span> : null}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
                <div className={`post-card__footer${isFeatured ? " post-card__footer--featured" : ""}`}>
                    {isFeatured ? (
                        <>
                            <Link className="btn btn-primary" to={`/blog/${post.slug}`} onClick={() => trackOpen(post.id)}>
                                Read article
                            </Link>
                            {showActions && onTagSelect && (
                                <button
                                    className="btn btn-link"
                                    type="button"
                                    onClick={() => onTagSelect(tag ?? "All")}
                                >
                                    View all {tag ?? "posts"}
                                    <FontAwesomeIcon icon={faArrowRightLong} />
                                </button>
                            )}
                        </>
                    ) : (
                        <Link className="link-primary" to={`/blog/${post.slug}`} onClick={() => trackOpen(post.id)}>
                            Read more
                            <FontAwesomeIcon icon={faArrowRightLong} />
                        </Link>
                    )}
                </div>
            </div>
        </article>
    );
}
