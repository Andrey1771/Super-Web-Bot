import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IBlogService } from "../../iterfaces/i-blog-service";
import type { BlogListItem, BlogPost, BlogPostVersion } from "../../types/blog";
import { renderMarkdown } from "../../utils/markdown";
import { useBlogTracking } from "../../hooks/use-blog-tracking";
import SafeBlogImage from "./SafeBlogImage";
import { getBlogPostCoverUrl } from "../../utils/blog-cover";
import PostCard from "../../pages/blog/components/PostCard";
import "./blog-page.css";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

const formatDate = (value?: string) => {
  if (!value) {
    return "Draft";
  }

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

const getReadableTextLength = (html: string): number => {
  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length;
};

const MIN_ARTICLE_TEXT_LENGTH = 40;

const buildTocAndInjectAnchors = (html: string): { contentHtml: string; headings: TocItem[] } => {
  if (!html) {
    return { contentHtml: "", headings: [] };
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html, "text/html");
  const headingElements = Array.from(documentNode.body.querySelectorAll("h2, h3, h4"));

  const usedIds = new Set<string>();
  const headings = headingElements
    .map((heading): TocItem | null => {
      const text = heading.textContent?.trim() ?? "";
      if (!text) {
        return null;
      }

      const level = Number.parseInt(heading.tagName.replace("H", ""), 10);
      const baseId = text
        .toLowerCase()
        .replace(/[^a-z0-9а-яё\s-]/gi, "")
        .trim()
        .replace(/\s+/g, "-") || "section";

      let id = baseId;
      let index = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${index}`;
        index += 1;
      }
      usedIds.add(id);

      heading.id = id;

      return { id, text, level };
    })
    .filter((item): item is TocItem => item !== null);

  return { contentHtml: documentNode.body.innerHTML, headings };
};

const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [version, setVersion] = useState<BlogPostVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogListItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string>("");
  const { trackOpen, trackReadProgress, trackReadComplete, trackBookmark } = useBlogTracking();

  useEffect(() => {
    const fetchPost = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!slug) {
          setPost(null);
          setVersion(null);
          setError("Post not found.");
          return;
        }

        const response = await blogService.getPostBySlug(slug);
        setPost(response.post);
        setVersion(response.version);
      } catch (fetchError) {
        console.error(fetchError);
        setPost(null);
        setVersion(null);
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

  useEffect(() => {
    const fetchRelated = async () => {
      if (!post) {
        setRelatedPosts([]);
        return;
      }

      try {
        setRelatedLoading(true);

        const firstTag = post.tags[0];
        const relatedByTag = await blogService.getPosts({
          page: 1,
          pageSize: 4,
          tag: firstTag || undefined
        });

        let nextItems = relatedByTag.items.filter((item) => item.id !== post.id);

        if (nextItems.length < 3) {
          const fallback = await blogService.getPosts({ page: 1, pageSize: 6 });
          const fallbackFiltered = fallback.items.filter((item) => item.id !== post.id && !nextItems.some((existing) => existing.id === item.id));
          nextItems = [...nextItems, ...fallbackFiltered];
        }

        setRelatedPosts(nextItems.slice(0, 3));
      } catch (relatedError) {
        console.error(relatedError);
        setRelatedPosts([]);
      } finally {
        setRelatedLoading(false);
      }
    };

    fetchRelated();
  }, [blogService, post]);

  const contentHtml = useMemo(() => {
    const markdownSource = version?.contentMarkdown?.trim() ?? "";
    const htmlFromMarkdown = markdownSource ? renderMarkdown(markdownSource) : "";
    const rawHtml = version?.contentHtml?.trim() ?? "";

    const rawHtmlLength = getReadableTextLength(rawHtml);
    const markdownLength = getReadableTextLength(htmlFromMarkdown);

    if (!rawHtml && !htmlFromMarkdown) {
      return "";
    }

    if (rawHtmlLength >= markdownLength) {
      return rawHtmlLength >= MIN_ARTICLE_TEXT_LENGTH ? rawHtml : htmlFromMarkdown;
    }

    return markdownLength >= MIN_ARTICLE_TEXT_LENGTH ? htmlFromMarkdown : rawHtml;
  }, [version?.contentHtml, version?.contentMarkdown]);

  const articleHasMeaningfulContent = useMemo(() => getReadableTextLength(contentHtml) >= MIN_ARTICLE_TEXT_LENGTH, [contentHtml]);

  const articleContent = useMemo(() => buildTocAndInjectAnchors(contentHtml), [contentHtml]);

  useEffect(() => {
    if (!articleContent.headings.length) {
      setActiveHeading(null);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (visibleEntry?.target?.id) {
          setActiveHeading(visibleEntry.target.id);
        }
      },
      { rootMargin: "0px 0px -70% 0px", threshold: [0.1, 1] }
    );

    articleContent.headings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [articleContent]);

  const topic = post?.topics?.[0] ?? post?.tags?.[0];
  const hasMeta = Boolean(post?.authorName || post?.publishedAt || post?.readingTime);

  const handleCopyLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback("Link copied");
    } catch (copyError) {
      console.error(copyError);
      setShareFeedback("Could not copy link");
    } finally {
      window.setTimeout(() => setShareFeedback(""), 1800);
    }
  }, []);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: post?.title, url });
        setShareFeedback("Shared");
      } catch {
        // user canceled share dialog
      } finally {
        window.setTimeout(() => setShareFeedback(""), 1800);
      }
      return;
    }

    await handleCopyLink();
  }, [handleCopyLink, post?.title]);

  if (loading) {
    return (
      <main className="blog-page">
        <section className="section">
          <div className="container blog-post-state-card" aria-busy="true">
            <div className="blog-post-loading-hero">
              <div className="skeleton blog-post-skeleton-chip" />
              <div className="skeleton blog-post-skeleton-title" />
              <div className="skeleton blog-post-skeleton-text" />
              <div className="skeleton blog-post-skeleton-meta" />
            </div>
            <div className="skeleton blog-post-skeleton-cover" />
            <div className="skeleton blog-post-skeleton-content" />
          </div>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="blog-page">
        <section className="section">
          <div className="container blog-post-state-card">
            <p className="eyebrow">Blog</p>
            <h2>Something went wrong</h2>
            <p className="muted">{error}</p>
            <Link className="btn btn-primary" to="/blog">
              Back to blog
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!post || !version) {
    return (
      <main className="blog-page">
        <section className="section">
          <div className="container blog-post-state-card">
            <p className="eyebrow">Blog</p>
            <h2>Post not found</h2>
            <p className="muted">We couldn&apos;t locate this article. It may have been moved or removed.</p>
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
      <section className="section blog-post-section">
        <div className="container blog-post-shell">
          <nav className="blog-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to="/blog">Blog</Link>
            <span aria-hidden="true">/</span>
            <span className="blog-breadcrumbs__current" aria-current="page">
              {post.title}
            </span>
          </nav>

          <header className="blog-post-hero surface">
            <div className="blog-post-cover" role="img" aria-label={`${post.title} cover`}>
              <SafeBlogImage src={getBlogPostCoverUrl(post)} alt={post.title} loading="eager" />
            </div>

            <div className="blog-post-hero__copy">
              {topic && <p className="badge blog-post-hero__topic">{topic}</p>}
              <h1>{post.title}</h1>
              {post.excerpt && <p className="blog-post-hero__excerpt">{post.excerpt}</p>}

              {hasMeta && (
                <div className="blog-post-meta" aria-label="Post metadata">
                  {post.authorName && <span>By {post.authorName}</span>}
                  {post.publishedAt && <span>{formatDate(post.publishedAt)}</span>}
                  {post.readingTime && <span>{post.readingTime} min read</span>}
                </div>
              )}

              <div className="blog-post-hero__actions" aria-label="Article actions">
                <Link className="btn btn-outline" to="/blog" aria-label="Back to blog list">
                  Back to blog
                </Link>
                <a className="btn btn-ghost" href="#post-content">
                  Jump to content
                </a>
                <button className="btn btn-ghost" type="button" onClick={() => trackBookmark(post.id)} aria-label="Save article for later">
                  Save for later
                </button>
              </div>
            </div>
          </header>

          <div className={`blog-post-layout${articleContent.headings.length > 1 ? " blog-post-layout--with-aside" : ""}`}>
            {articleContent.headings.length > 1 && (
              <aside className="blog-post-aside surface" aria-label="Article tools">
                <p className="blog-post-aside__title">On this page</p>
                <ul className="blog-post-toc">
                  {articleContent.headings.map((heading) => (
                    <li key={heading.id} className={`blog-post-toc__item blog-post-toc__item--h${heading.level}`}>
                      <a className={activeHeading === heading.id ? "is-active" : ""} href={`#${heading.id}`}>
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ul>
                <div className="blog-post-share">
                  <p className="blog-post-aside__title">Share</p>
                  <button className="btn btn-outline" type="button" onClick={handleCopyLink}>Copy link</button>
                  <button className="btn btn-ghost" type="button" onClick={handleShare}>Share</button>
                  <a href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(window.location.href)}`}>
                    Share via email
                  </a>
                  {shareFeedback && <span className="blog-post-share__feedback">{shareFeedback}</span>}
                </div>
              </aside>
            )}

            {articleHasMeaningfulContent ? (
              <article id="post-content" className="blog-post-content blog-post-content--article surface" dangerouslySetInnerHTML={{ __html: articleContent.contentHtml }} />
            ) : (
              <article id="post-content" className="blog-post-content surface blog-post-content--empty">
                <h2>Article content is coming soon</h2>
                <p className="muted">This post has metadata, but the full article body is not available yet.</p>
              </article>
            )}
          </div>

          <footer className="blog-post-footer">
            <div className="blog-post-footer__main surface">
              {post.tags.length > 0 && (
                <div className="blog-post-footer__group" aria-label="Post tags">
                  <h3>Tags</h3>
                  <div className="blog-post-tags">
                    {post.tags.map((tag) => (
                      <Link key={tag} to={`/blog?tag=${encodeURIComponent(tag)}`} className="blog-tag">
                        #{tag}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="blog-post-footer__group" aria-label="Share article">
                <h3>Share this article</h3>
                <div className="blog-post-footer__share-row">
                  <button className="btn btn-outline" type="button" onClick={handleCopyLink}>
                    Copy link
                  </button>
                  <button className="btn btn-outline" type="button" onClick={handleShare}>
                    Share
                  </button>
                  <a className="btn btn-outline" href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(window.location.href)}`}>
                    Share via email
                  </a>
                </div>
                {shareFeedback && <p className="blog-post-share__feedback">{shareFeedback}</p>}
              </div>

              <div className="blog-post-footer__group">
                <Link className="btn btn-primary" to="/blog">
                  Back to blog
                </Link>
              </div>
            </div>

            {post.authorName && (
              <div className="blog-post-author-card surface">
                <p className="eyebrow">Author</p>
                <h3>{post.authorName}</h3>
                <p className="muted">Writes about games, updates, and practical buying guides at Tale Shop Blog.</p>
              </div>
            )}
          </footer>

          <section className="related-posts-section" aria-labelledby="related-posts-title">
            <div className="related-posts-section__header">
              <h2 id="related-posts-title">Related posts</h2>
              <p className="muted">More stories you might enjoy.</p>
            </div>

            {relatedLoading ? (
              <div className="related-posts-grid" aria-busy="true">
                {[1, 2, 3].map((item) => (
                  <div className="related-posts-skeleton surface" key={item}>
                    <div className="skeleton related-posts-skeleton__media" />
                    <div className="skeleton related-posts-skeleton__title" />
                    <div className="skeleton related-posts-skeleton__meta" />
                  </div>
                ))}
              </div>
            ) : relatedPosts.length > 0 ? (
              <div className="related-posts-grid">
                {relatedPosts.map((item) => (
                  <PostCard key={item.id} post={item} variant="compact" className="related-post-card" />
                ))}
              </div>
            ) : (
              <div className="related-posts-empty surface">
                <p className="muted">No related posts yet. Explore the full blog for more articles.</p>
                <Link className="btn btn-outline" to="/blog">
                  Browse all posts
                </Link>
              </div>
            )}
          </section>

        </div>
      </section>
    </main>
  );
};

export default BlogPostPage;
