import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IBlogService } from "../../iterfaces/i-blog-service";
import type { BlogPost, BlogPostVersion } from "../../types/blog";
import { renderMarkdown } from "../../utils/markdown";
import { useBlogTracking } from "../../hooks/use-blog-tracking";
import "./blog-page.css";

const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [version, setVersion] = useState<BlogPostVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { trackOpen, trackReadProgress, trackReadComplete, trackBookmark } = useBlogTracking();

  useEffect(() => {
    const fetchPost = async () => {
      try {
        setLoading(true);
        setError(null);
        if (!slug) {
          setError("Post not found.");
          return;
        }
        const response = await blogService.getPostBySlug(slug);
        setPost(response.post);
        setVersion(response.version);
      } catch (fetchError) {
        console.error(fetchError);
        setError("Unable to load blog post.");
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [blogService, slug]);

  useEffect(() => {
    if (!post) {
      return;
    }
    trackOpen(post.id);
  }, [post, trackOpen]);

  useEffect(() => {
    if (!post) {
      return;
    }

    const start = Date.now();
    const minReadTimeMs = 30000;
    const interval = window.setInterval(() => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const viewportHeight = window.innerHeight;
      const scrollHeight = doc.scrollHeight;
      const scrollDepth = scrollHeight ? Math.min((scrollTop + viewportHeight) / scrollHeight, 1) : 0;
      const dwellMs = Date.now() - start;

      trackReadProgress(post.id, scrollDepth, dwellMs);

      if (scrollDepth >= 0.8 && dwellMs >= minReadTimeMs) {
        trackReadComplete(post.id, dwellMs);
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [post, trackReadComplete, trackReadProgress]);

  const contentHtml = useMemo(() => {
    return renderMarkdown(version?.contentMarkdown ?? "");
  }, [version?.contentMarkdown]);

  if (loading) {
    return (
      <main className="blog-page">
        <section className="section">
          <div className="container">
            <div className="skeleton h-10" />
            <div className="skeleton h-80 mt-4" />
          </div>
        </section>
      </main>
    );
  }

  if (error || !post || !version) {
    return (
      <main className="blog-page">
        <section className="section">
          <div className="container">
            <h2>Post not found</h2>
            <p className="muted">{error ?? "We couldn't locate this post."}</p>
            <Link className="btn btn-primary" to="/blog">
              Back to blog
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="blog-page">
      <section className="section">
        <div className="container">
          <Link className="btn btn-outline" to="/blog">
            ← Back to blog
          </Link>
          <div className="blog-post-header">
            <h1>{post.title}</h1>
            <p className="muted">{post.excerpt}</p>
            <div className="blog-post-meta">
              <span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "Draft"}</span>
              {post.readingTime && <span>{post.readingTime} min read</span>}
            </div>
            <div className="blog-post-tags">
              {post.tags.map((tag) => (
                <span key={tag} className="blog-tag">
                  {tag}
                </span>
              ))}
              <button className="btn btn-outline" type="button" onClick={() => trackBookmark(post.id)}>
                Save
              </button>
            </div>
          </div>
          {post.coverUrl && (
            <div className="blog-post-cover">
              <img src={post.coverUrl} alt={post.title} />
            </div>
          )}
          <article className="blog-post-content prose max-w-none" dangerouslySetInnerHTML={{ __html: contentHtml }} />
        </div>
      </section>
    </main>
  );
};

export default BlogPostPage;
