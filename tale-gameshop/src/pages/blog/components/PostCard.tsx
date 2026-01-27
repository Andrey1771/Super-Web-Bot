import React, {useEffect, useRef} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faArrowRightLong} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import type {BlogListItem} from "../../../types/blog";
import {useBlogTracking} from "../../../hooks/use-blog-tracking";

const FALLBACK_COVER = "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1600&q=80";

type PostCardProps = {
    post: BlogListItem;
    className?: string;
    showCategoryBadge?: boolean;
};

const formatDate = (value?: string) => {
    if (!value) {
        return "Draft";
    }
    return new Date(value).toLocaleDateString();
};

export default function PostCard({post, className, showCategoryBadge = true}: PostCardProps) {
    const {trackImpression, trackOpen} = useBlogTracking();
    const cardRef = useRef<HTMLElement | null>(null);
    const coverImageUrl = post.coverUrl || FALLBACK_COVER;

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

    return (
        <article className={`post-card${className ? ` ${className}` : ""}`} ref={cardRef}>
            <div className="post-media" aria-hidden="true">
                {showCategoryBadge && post.tags[0] && <span className="badge category-badge">{post.tags[0]}</span>}
                <div className="media-overlay" />
                <img src={coverImageUrl} alt={post.title} />
            </div>
            <div className="post-body">
                <h3>{post.title}</h3>
                <div className="meta-row">
                    <span>{formatDate(post.publishedAt)}</span>
                    <span className="divider-dot" aria-hidden="true">•</span>
                    <span>{post.readingTime ? `${post.readingTime} min read` : "Quick read"}</span>
                </div>
                <p>{post.excerpt}</p>
                <div className="post-footer">
                    <Link className="link-primary" to={`/blog/${post.slug}`} onClick={() => trackOpen(post.id)}>
                        Read more
                        <FontAwesomeIcon icon={faArrowRightLong} />
                    </Link>
                </div>
            </div>
        </article>
    );
}
