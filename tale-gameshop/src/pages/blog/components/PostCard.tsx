import React, {useEffect, useMemo, useRef} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faArrowRightLong} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import type {BlogListItem} from "../../../types/blog";
import {useBlogTracking} from "../../../hooks/use-blog-tracking";

const FALLBACK_COVER = "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1600&q=80";

type PostCardVariant = "compact" | "featured" | "mini";

type PostCardProps = {
    post: BlogListItem;
    className?: string;
    variant?: PostCardVariant;
    showCategoryBadge?: boolean;
    showFeaturedBadge?: boolean;
    showActions?: boolean;
    onTagSelect?: (tag: string) => void;
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
    onTagSelect
}: PostCardProps) {
    const {trackImpression, trackOpen} = useBlogTracking();
    const cardRef = useRef<HTMLElement | null>(null);
    const coverImageUrl = post.coverUrl || FALLBACK_COVER;
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
        return "line-clamp-2";
    }, [isFeatured, isMini]);
    const excerptClamp = isFeatured ? "line-clamp-4" : "line-clamp-3";
    const TitleTag = (isFeatured ? "h2" : isMini ? "h4" : "h3") as React.ElementType;

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
            >
                <div className="post-card__media post-card__media--mini" aria-hidden="true">
                    <img src={coverImageUrl} alt={post.title} />
                </div>
                <div className="post-card__body post-card__body--mini">
                    <Link className="post-card__title-link" to={`/blog/${post.slug}`} onClick={() => trackOpen(post.id)}>
                        <TitleTag className={`post-card__title ${titleClamp}`}>{post.title}</TitleTag>
                    </Link>
                    <div className="meta-row">
                        <span>{formatDate(post.publishedAt)}</span>
                        <span className="divider-dot" aria-hidden="true">•</span>
                        <span>{post.readingTime ? `${post.readingTime} min read` : "Quick read"}</span>
                    </div>
                </div>
            </article>
        );
    }

    return (
        <article
            className={`post-card post-card--${variant}${className ? ` ${className}` : ""}`}
            ref={cardRef}
        >
            <div className={`post-card__media post-card__media--${variant}`} aria-hidden="true">
                {showCategoryBadge && tag && !isFeatured && <span className="badge category-badge">{tag}</span>}
                <div className="media-overlay" />
                <img src={coverImageUrl} alt={post.title} />
            </div>
            <div className={`post-card__body post-card__body--${variant}`}>
                <div className={`post-card__content${isFeatured ? " measure-60ch" : ""}`}>
                    {isFeatured && showFeaturedBadge && <span className="badge featured-badge">Featured</span>}
                    <TitleTag className={`post-card__title ${titleClamp}`}>{post.title}</TitleTag>
                    <div className="meta-row">
                        <span>{formatDate(post.publishedAt)}</span>
                        <span className="divider-dot" aria-hidden="true">•</span>
                        <span>{post.readingTime ? `${post.readingTime} min read` : "Quick read"}</span>
                        {isFeatured && tag && <span className="meta-pill">{tag}</span>}
                    </div>
                    {!isFeatured && <p className={`post-card__excerpt ${excerptClamp}`}>{post.excerpt}</p>}
                    {isFeatured && <p className={`post-card__excerpt ${excerptClamp}`}>{post.excerpt}</p>}
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
