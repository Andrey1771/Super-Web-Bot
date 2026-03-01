import React from "react";
import {Link} from "react-router-dom";

const FEATURED_PICK = {
    tag: "RPG",
    title: "Exciting PC RPGs to Play This Month",
    excerpt: "Discover the most captivating RPGs to dive into this month. Adventure awaits, with epic stories and immersive gameplay.",
    meta: "May 2 • 6 min read",
    imageUrl: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1400&q=80"
};

export default function FeaturedEditorsPickCard() {
    return (
        <article className="featured-editors-card" aria-label="Featured editor's pick">
            <img src={FEATURED_PICK.imageUrl} alt={FEATURED_PICK.title} className="featured-editors-card__cover" />
            <div className="featured-editors-card__content">
                <span className="featured-editors-card__tag">{FEATURED_PICK.tag}</span>
                <h3>{FEATURED_PICK.title}</h3>
                <p className="featured-editors-card__excerpt">{FEATURED_PICK.excerpt}</p>
                <p className="featured-editors-card__meta">{FEATURED_PICK.meta}</p>
                <Link className="featured-editors-card__cta" to="/blog">
                    Read more →
                </Link>
            </div>
        </article>
    );
}
