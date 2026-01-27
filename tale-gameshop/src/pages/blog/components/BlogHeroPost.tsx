import React, {useEffect, useRef} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faArrowRightLong} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import type {BlogListItem} from "../../../types/blog";
import styles from "./blog-hero-post.module.css";
import {useBlogTracking} from "../../../hooks/use-blog-tracking";

type BlogHeroPostProps = {
    post: BlogListItem;
    onTagSelect?: (tag: string) => void;
};

const formatDate = (value?: string) => {
    if (!value) {
        return "Draft";
    }
    return new Date(value).toLocaleDateString();
};

export default function BlogHeroPost({post, onTagSelect}: BlogHeroPostProps) {
    const {trackImpression, trackOpen} = useBlogTracking();
    const heroRef = useRef<HTMLElement | null>(null);
    const coverImageUrl = post.coverUrl;
    const tag = post.tags[0];

    useEffect(() => {
        const node = heroRef.current;
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
        <article className={styles.card} ref={heroRef}>
            <div className={styles.media}>
                {coverImageUrl ? (
                    <img src={coverImageUrl} alt={post.title} className={styles.mediaImage} />
                ) : (
                    <div className={styles.mediaPlaceholder} role="img" aria-label="Article cover placeholder" />
                )}
                <div className={styles.mediaOverlay} />
            </div>
            <div className={styles.content}>
                <div className={styles.contentBody}>
                    <span className={styles.badge}>Featured</span>
                    <h2 className={`${styles.title} ${styles.clamp3}`}>{post.title}</h2>
                    <div className={styles.metaRow}>
                        <span>{formatDate(post.publishedAt)}</span>
                        <span className={styles.dividerDot} aria-hidden="true">•</span>
                        <span>{post.readingTime ? `${post.readingTime} min read` : "Quick read"}</span>
                        {tag && <span className={styles.metaPill}>{tag}</span>}
                    </div>
                    <p className={`${styles.excerpt} ${styles.clamp5}`}>{post.excerpt}</p>
                </div>
                <div className={styles.footer}>
                    <Link className="btn btn-primary" to={`/blog/${post.slug}`} onClick={() => trackOpen(post.id)}>
                        Read article
                    </Link>
                    <button
                        className="btn btn-link"
                        type="button"
                        onClick={() => onTagSelect?.(tag ?? "All")}
                    >
                        View all {tag ?? "posts"}
                        <FontAwesomeIcon icon={faArrowRightLong} />
                    </button>
                </div>
            </div>
        </article>
    );
}
