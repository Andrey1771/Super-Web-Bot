import React from "react";
import {Link} from "react-router-dom";
import type {BlogListItem} from "../../types/blog";
import SafeBlogImage from "./SafeBlogImage";
import {getBlogPostCoverUrl} from "../../utils/blog-cover";

type FeaturedEditorsPickCardProps = {
    post?: BlogListItem | null;
};

const formatDate = (value?: string) => {
    if (!value) {
        return "Draft";
    }

    return new Date(value).toLocaleDateString();
};

export default function FeaturedEditorsPickCard({post}: FeaturedEditorsPickCardProps) {
    if (!post) {
        return (
            <article className="featured-editors-card featured-editors-card--empty" aria-label="Featured editor's pick">
                <div className="featured-editors-card__content">
                    <span className="featured-editors-card__tag">Blog</span>
                    <h3>Featured article will appear here</h3>
                    <p className="featured-editors-card__excerpt">Publish an article and mark it as the main blog hero in admin to highlight it here.</p>
                </div>
            </article>
        );
    }

    const tag = post.tags?.[0] ?? "Blog";
    const readTime = post.readingTime ? `${post.readingTime} min read` : null;

    return (
        <article className="featured-editors-card" aria-label="Featured editor's pick">
            <SafeBlogImage src={getBlogPostCoverUrl(post)} alt={post.title} className="featured-editors-card__cover" />
            <div className="featured-editors-card__content">
                <span className="featured-editors-card__tag">{tag}</span>
                <h3>{post.title}</h3>
                <p className="featured-editors-card__excerpt">{post.excerpt}</p>
                <p className="featured-editors-card__meta">{formatDate(post.publishedAt)}{readTime ? ` • ${readTime}` : ""}</p>
                <Link className="featured-editors-card__cta" to={`/blog/${post.slug}`}>
                    Read more →
                </Link>
            </div>
        </article>
    );
}
