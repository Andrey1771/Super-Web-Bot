import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IBlogService } from "../../iterfaces/i-blog-service";
import type { BlogEngagementSummary, BlogListItem, BlogPost, BlogPostStats, BlogPostVersion } from "../../types/blog";
import { renderMarkdown } from "../../utils/markdown";
import { getAnonId, getSessionId, useBlogTracking } from "../../hooks/use-blog-tracking";
import SafeBlogImage from "./SafeBlogImage";
import { getBlogPostCoverUrl } from "../../utils/blog-cover";
import PostCard from "../../pages/blog/components/PostCard";
import "./blog-page.css";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

const READ_TRACK_KEY = "tale_blog_post_read_tracked";

const getSessionGuard = (key: string, slug: string) => {
  if (typeof window === "undefined" || !slug) {
    return false;
  }
  return window.sessionStorage.getItem(`${key}:${slug}`) === "1";
};

const setSessionGuard = (key: string, slug: string) => {
  if (typeof window === "undefined" || !slug) {
    return;
  }
  window.sessionStorage.setItem(`${key}:${slug}`, "1");
};

const getArticleReadProgress = (articleElement: HTMLElement): number => {
  const rect = articleElement.getBoundingClientRect();
  const articleTop = rect.top + window.scrollY;
  const articleHeight = Math.max(articleElement.scrollHeight, 1);
  const viewportBottom = window.scrollY + window.innerHeight;
  const consumed = viewportBottom - articleTop;
  return Math.max(0, Math.min(consumed / articleHeight, 1));
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
  const [engagement, setEngagement] = useState<BlogEngagementSummary | null>(null);
  const [postStats, setPostStats] = useState<BlogPostStats | null>(null);
  const [reactionLoading, setReactionLoading] = useState<string | null>(null);
  const viewTrackedRef = useRef<string | null>(null);
  const readTrackedRef = useRef(false);
  const { trackBookmark } = useBlogTracking();
  const reactions = ["👍", "❤️", "🔥", "🎮", "👀"];

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
        setPostStats(response.stats ?? {
          postId: response.post.id,
          viewsCount: response.post.viewCount ?? 0,
          completedReadsCount: response.post.completedReadsCount ?? 0
        });
      } catch (fetchError) {
        console.error(fetchError);
        setPost(null);
        setVersion(null);
        setPostStats(null);
        setError("Unable to load blog post.");
      } finally {
        setLoading(false);
      }
    };

    viewTrackedRef.current = null;
    fetchPost();
  }, [blogService, slug]);

  useEffect(() => {
    if (!post || !slug) {
      return;
    }

    if (viewTrackedRef.current === slug) {
      return;
    }

    viewTrackedRef.current = slug;
    blogService.trackPostView({
      slug,
      anonId: getAnonId(),
      sessionKey: getSessionId()
    })
      .then((stats) => setPostStats(stats))
      .catch((trackingError) => {
        viewTrackedRef.current = null;
        console.warn("Failed to track post view", trackingError);
      });
  }, [blogService, post, slug]);

  useEffect(() => {
    if (!post || !slug) {
      return;
    }

    if (getSessionGuard(READ_TRACK_KEY, slug)) {
      readTrackedRef.current = true;
      return;
    }

    readTrackedRef.current = false;
    let visibleMs = 0;
    const minReadTimeMs = 10000;
    const interval = window.setInterval(() => {
      if (readTrackedRef.current || document.visibilityState !== "visible") {
        return;
      }

      const articleElement = document.getElementById("post-content");
      if (!(articleElement instanceof HTMLElement)) {
        return;
      }

      visibleMs += 500;
      const scrollDepth = getArticleReadProgress(articleElement);
      const dwellMs = visibleMs;

      if (scrollDepth >= 0.7 && dwellMs >= minReadTimeMs) {
        readTrackedRef.current = true;
        setSessionGuard(READ_TRACK_KEY, slug);
        blogService.trackCompletedRead({
          slug,
          anonId: getAnonId(),
          sessionKey: getSessionId()
        })
          .then((stats) => setPostStats(stats))
          .catch((trackingError) => {
            readTrackedRef.current = false;
            window.sessionStorage.removeItem(`${READ_TRACK_KEY}:${slug}`);
            console.warn("Failed to track completed read", trackingError);
          });
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [blogService, post, slug]);

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
    const rawHtml = version?.contentHtml?.trim() ?? "";
    if (rawHtml) {
      return rawHtml;
    }

    const markdownSource = version?.contentMarkdown?.trim() ?? "";
    return markdownSource ? renderMarkdown(markdownSource) : "";
  }, [version?.contentHtml, version?.contentMarkdown]);

  const articleHasMeaningfulContent = useMemo(() => {
    const hasHtml = Boolean(version?.contentHtml?.trim());
    const hasMarkdown = Boolean(version?.contentMarkdown?.trim());
    return hasHtml || hasMarkdown;
  }, [version?.contentHtml, version?.contentMarkdown]);

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

  useEffect(() => {
    const fetchEngagement = async () => {
      if (!post) {
        setEngagement(null);
        return;
      }

      try {
        const items = await blogService.getEngagementSummary([post.id], getAnonId());
        setEngagement(items[0] ?? null);
      } catch (engagementError) {
        console.warn("Failed to load engagement summary", engagementError);
      }
    };

    fetchEngagement();
  }, [blogService, post]);

  const handleReaction = useCallback(async (reaction: string) => {
    if (!post) {
      return;
    }

    setReactionLoading(reaction);
    try {
      const summary = await blogService.setReaction({
        postId: post.id,
        reaction,
        anonId: getAnonId(),
        sessionId: getSessionId()
      });
      setEngagement(summary);
    } catch (reactionError) {
      console.warn("Failed to set reaction", reactionError);
    } finally {
      setReactionLoading(null);
    }
  }, [blogService, post]);

  const topic = post?.topics?.[0] ?? post?.tags?.[0];
  const hasMeta = Boolean(post?.authorName || post?.publishedAt || post?.readingTime);

  const shareUrl = useMemo(() => {
    if (!post?.slug) {
      return window.location.href;
    }

    return `${window.location.origin}/blog/${post.slug}`;
  }, [post?.slug]);

  const emailShareLink = useMemo(() => {
    const subject = `Check out this article: ${post?.title ?? "Blog post"}`;
    const excerptLine = post?.excerpt?.trim() ? `${post.excerpt.trim()}

` : "";
    const body = `I thought you might like this article:

${excerptLine}${shareUrl}`;
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [post?.excerpt, post?.title, shareUrl]);

  const handleCopyLink = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const helper = document.createElement("textarea");
        helper.value = shareUrl;
        helper.setAttribute("readonly", "");
        helper.style.position = "absolute";
        helper.style.left = "-9999px";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        document.body.removeChild(helper);
      }
      setShareFeedback("Link copied");
    } catch (copyError) {
      console.error(copyError);
      setShareFeedback("Could not copy link");
    } finally {
      window.setTimeout(() => setShareFeedback(""), 1800);
    }
  }, [shareUrl]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: post?.title,
          text: post?.excerpt?.trim() || undefined,
          url: shareUrl
        });
        setShareFeedback("Shared");
      } catch {
        // user canceled or browser denied share
      } finally {
        window.setTimeout(() => setShareFeedback(""), 1800);
      }
      return;
    }

    await handleCopyLink();
  }, [handleCopyLink, post?.excerpt, post?.title, shareUrl]);

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
                  {typeof postStats?.viewsCount === "number" && <span>{postStats.viewsCount} views</span>}
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

              <div className="post-reactions surface" aria-label="Post reactions">
                <p className="post-reactions__title">React to this post</p>
                <div className="post-reactions__list">
                  {reactions.map((emoji) => {
                    const count = engagement?.reactions?.[emoji] ?? 0;
                    const isActive = engagement?.myReaction === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        className={`post-reactions__chip ${isActive ? "active" : ""}`}
                        onClick={() => handleReaction(emoji)}
                        disabled={Boolean(reactionLoading)}
                      >
                        <span>{emoji}</span>
                        {count > 0 ? <span>{count}</span> : null}
                      </button>
                    );
                  })}
                </div>
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
                  <button className="btn btn-outline" type="button" onClick={handleCopyLink}>{shareFeedback === "Link copied" ? "Copied" : "Copy link"}</button>
                  <button className="btn btn-ghost" type="button" onClick={handleShare}>Share</button>
                  <a href={emailShareLink}>
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
                  <a className="btn btn-outline" href={emailShareLink}>
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
