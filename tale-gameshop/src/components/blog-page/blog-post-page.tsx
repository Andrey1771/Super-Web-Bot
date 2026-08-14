import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IBlogService } from "../../iterfaces/i-blog-service";
import type { BlogEngagementSummary, BlogListItem, BlogPost, BlogPostStats, BlogPostVersion } from "../../types/blog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faEnvelope, faEye, faLink } from "@fortawesome/free-solid-svg-icons";
import { faFacebookF, faTelegram, faWhatsapp, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { renderMarkdown } from "../../utils/markdown";
import { getAnonId, getSessionId } from "../../hooks/use-blog-tracking";
import PostCoverArt from "./PostCoverArt";
import BlogComments from "./BlogComments";
import PostCard from "../../pages/blog/components/PostCard";
import PageMeta from "../common/PageMeta";
import Breadcrumbs from "../common/Breadcrumbs";
import { normalizeBlogCoverUrl } from "../../utils/blog-cover";
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

  // Дата всегда в en-US: интерфейс англоязычный, а локаль браузера у покупателя
  // может быть любой — «9 августа 2026 г.» посреди английской страницы выглядит багом.
  return new Date(value).toLocaleDateString("en-US", {
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
  const [adjacentPosts, setAdjacentPosts] = useState<{ newer: BlogListItem | null; older: BlogListItem | null }>({
    newer: null,
    older: null
  });
  const [shareFeedback, setShareFeedback] = useState<string>("");
  const [engagement, setEngagement] = useState<BlogEngagementSummary | null>(null);
  const [postStats, setPostStats] = useState<BlogPostStats | null>(null);
  const [reactionLoading, setReactionLoading] = useState<string | null>(null);
  const viewTrackedRef = useRef(false);
  const interactedRef = useRef(false);
  const readTrackedRef = useRef(false);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
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

    viewTrackedRef.current = false;
    interactedRef.current = false;
    fetchPost();
  }, [blogService, slug]);

  useEffect(() => {
    interactedRef.current = false;
    const markInteraction = () => {
      interactedRef.current = true;
    };

    window.addEventListener("scroll", markInteraction, { passive: true });
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("pointerdown", markInteraction);

    return () => {
      window.removeEventListener("scroll", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("pointerdown", markInteraction);
    };
  }, [slug]);

  useEffect(() => {
    if (!post || !slug || viewTrackedRef.current) {
      return;
    }

    let visibleMs = 0;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        visibleMs += 500;
      }

      if (visibleMs < 5000 || !interactedRef.current || viewTrackedRef.current) {
        return;
      }

      viewTrackedRef.current = true;
      window.clearInterval(interval);
      blogService.trackPostView({
        slug,
        anonId: getAnonId(),
        sessionId: getSessionId(),
        isVisible: true,
        hasInteraction: true,
        activeDwellMs: visibleMs
      })
        .then((stats) => setPostStats(stats))
        .catch((trackingError) => {
          viewTrackedRef.current = false;
          console.warn("Failed to track post view", trackingError);
        });
    }, 500);

    return () => window.clearInterval(interval);
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

  // Соседи по ленте для навигации «новее/старше». Отдельного эндпоинта для
  // соседних постов нет — берём первую сотню ленты (отсортирована по дате,
  // новые первыми) и находим текущий пост в ней; на объёмах нашего блога
  // этого хватает с большим запасом.
  useEffect(() => {
    if (!post) {
      setAdjacentPosts({ newer: null, older: null });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const feed = await blogService.getPosts({ page: 1, pageSize: 100 });
        if (cancelled) {
          return;
        }
        const index = feed.items.findIndex((item) => item.id === post.id);
        if (index === -1) {
          setAdjacentPosts({ newer: null, older: null });
          return;
        }
        setAdjacentPosts({
          newer: index > 0 ? feed.items[index - 1] : null,
          older: index < feed.items.length - 1 ? feed.items[index + 1] : null
        });
      } catch (navigationError) {
        console.warn("Failed to load adjacent posts", navigationError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blogService, post]);

  // Полоса прогресса чтения под верхним краем окна. Ширина обновляется напрямую
  // через style.transform (не через state): setState на каждый скролл перерисовывал
  // бы всю страницу.
  useEffect(() => {
    if (!post) {
      return;
    }

    let rafId = 0;
    const update = () => {
      rafId = 0;
      const articleElement = document.getElementById("post-content");
      const bar = progressBarRef.current;
      if (!(articleElement instanceof HTMLElement) || !bar) {
        return;
      }
      bar.style.transform = `scaleX(${getArticleReadProgress(articleElement)})`;
    };
    const requestUpdate = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(update);
      }
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [post]);

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

  // Плавный переход по оглавлению; #hash в адресе сохраняем для шаринга ссылкой.
  const handleTocClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    event.preventDefault();
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  const topic = post?.topics?.[0] ?? post?.tags?.[0];
  const hasMeta = Boolean(post?.authorName || post?.publishedAt || post?.readingTime);

  const shareUrl = useMemo(() => {
    if (!post?.slug) {
      return window.location.href;
    }

    return `${window.location.origin}/news/${post.slug}`;
  }, [post?.slug]);

  const emailShareLink = useMemo(() => {
    const subject = `Check out this article: ${post?.title ?? "Blog post"}`;
    const excerptLine = post?.excerpt?.trim() ? `${post.excerpt.trim()}

` : "";
    const body = `I thought you might like this article:

${excerptLine}${shareUrl}`;
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [post?.excerpt, post?.title, shareUrl]);

  // Настоящая обложка поста (не заглушка) — для превью в соцсетях и разметки.
  // Адрес приводим к абсолютному: роботы не резолвят относительные пути в JSON-LD.
  const absoluteCoverUrl = useMemo(() => {
    const cover = normalizeBlogCoverUrl(post?.coverUrl ?? post?.imageUrl);
    if (!cover) {
      return undefined;
    }
    return cover.startsWith("http") ? cover : `${window.location.origin}${cover}`;
  }, [post?.coverUrl, post?.imageUrl]);

  const articleStructuredData = useMemo(() => {
    if (!post) {
      return null;
    }

    return {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      ...(post.excerpt ? { description: post.excerpt } : {}),
      ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
      dateModified: post.updatedAt,
      mainEntityOfPage: shareUrl,
      ...(absoluteCoverUrl ? { image: absoluteCoverUrl } : {}),
      // Автор у нас редакция, а не персона — поэтому Organization, не Person.
      ...(post.authorName ? { author: { "@type": "Organization", name: post.authorName } } : {}),
      publisher: { "@type": "Organization", name: "Tale Shop" }
    };
  }, [post, shareUrl, absoluteCoverUrl]);

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

  // Шеринг — прямые ссылки на соцсети (как у конкурентов), а не кнопки-слова.
  const shareTargets = useMemo(() => {
    const url = encodeURIComponent(shareUrl);
    const title = encodeURIComponent(post?.title ?? "");
    return [
      { label: "Telegram", href: `https://t.me/share/url?url=${url}&text=${title}`, icon: faTelegram },
      { label: "WhatsApp", href: `https://wa.me/?text=${title}%20${url}`, icon: faWhatsapp },
      { label: "X", href: `https://twitter.com/intent/tweet?url=${url}&text=${title}`, icon: faXTwitter },
      { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${url}`, icon: faFacebookF }
    ];
  }, [shareUrl, post?.title]);

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
            <p className="eyebrow">News</p>
            <h2>Something went wrong</h2>
            <p className="muted">{error}</p>
            <Link className="btn btn-primary" to="/news">
              Back to news
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
            <p className="eyebrow">News</p>
            <h2>Post not found</h2>
            <p className="muted">We couldn&apos;t locate this article. It may have been moved or removed.</p>
            <Link className="btn btn-primary" to="/news">
              Back to news
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="blog-page">
      <PageMeta
        title={post.title}
        description={post.excerpt || undefined}
        canonicalPath={`/news/${post.slug}`}
        imageUrl={absoluteCoverUrl}
        ogType="article"
        structuredData={articleStructuredData}
      />
      <div className="blog-post-progress" aria-hidden="true">
        <div className="blog-post-progress__bar" ref={progressBarRef} />
      </div>
      <section className="section blog-post-section">
        <div className="container blog-post-shell">
          {/* Общий компонент крошек: тот же вид, что в каталоге, плюс
              разметка BreadcrumbList для выдачи. */}
          <Breadcrumbs
            items={[
              { label: "Home", to: "/" },
              { label: "News", to: "/news" },
              { label: post.title }
            ]}
          />

          {/* Хиро как у конкурентов: компактная обложка слева, справа заголовок,
              экскерпт, мета и ряд иконок шеринга — весь «социальный» блок наверху. */}
          <header className="blog-post-hero surface">
            <div className="blog-post-cover">
              <PostCoverArt post={post} loading="eager" />
            </div>

            <div className="blog-post-hero__head">
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

              <div className="blog-post-share-icons" aria-label="Share article">
                <button
                  className="share-icon"
                  type="button"
                  onClick={handleCopyLink}
                  aria-label="Copy link"
                  title={shareFeedback === "Link copied" ? "Copied" : "Copy link"}
                >
                  <FontAwesomeIcon icon={shareFeedback === "Link copied" ? faCheck : faLink} />
                </button>
                {shareTargets.map((target) => (
                  <a
                    key={target.label}
                    className="share-icon"
                    href={target.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Share on ${target.label}`}
                    title={target.label}
                  >
                    <FontAwesomeIcon icon={target.icon} />
                  </a>
                ))}
                <a className="share-icon" href={emailShareLink} aria-label="Share via email" title="Email">
                  <FontAwesomeIcon icon={faEnvelope} />
                </a>
              </div>
            </div>
          </header>

          {/* Одна карточка статьи во всю ширину — как обложка. Внутри: текст,
              а за разделителем реакции, шеринг и теги. Отдельные плавающие блоки
              (полоска реакций, карточка автора) читались как несвязанные куски;
              карточка автора убрана совсем — автор у нас всегда редакция. */}
          <div className="blog-post-card surface">
            {/* Оглавление из двух пунктов навигационной ценности не имеет —
                показываем только от трёх заголовков. */}
            {articleContent.headings.length >= 3 && (
              <nav className="blog-post-toc-inline" aria-label="Table of contents">
                <span className="blog-post-toc-inline__title">On this page</span>
                {articleContent.headings.map((heading) => (
                  <a key={heading.id} href={`#${heading.id}`} onClick={(event) => handleTocClick(event, heading.id)}>
                    {heading.text}
                  </a>
                ))}
              </nav>
            )}

            {articleHasMeaningfulContent ? (
              <article id="post-content" className="blog-post-content blog-post-content--article" dangerouslySetInnerHTML={{ __html: articleContent.contentHtml }} />
            ) : (
              <article id="post-content" className="blog-post-content blog-post-content--empty">
                <h2>Article content is coming soon</h2>
                <p className="muted">This post has metadata, but the full article body is not available yet.</p>
              </article>
            )}

            {/* Низ карточки: реакции слева, просмотры справа (сюда они переехали
                из шапки), теги — строкой ниже. */}
            <div className="blog-post-card__footer">
              <div className="blog-post-card__row">
                <div className="post-reactions-inline" aria-label="Post reactions">
                  <span className="blog-post-card__label">React</span>
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

                {typeof postStats?.viewsCount === "number" && (
                  <span className="views-pill" title="Views">
                    <FontAwesomeIcon icon={faEye} aria-hidden="true" />
                    {`${postStats.viewsCount} ${postStats.viewsCount === 1 ? "view" : "views"}`}
                  </span>
                )}
              </div>

              {post.tags.length > 0 && (
                <div className="blog-post-tags" aria-label="Post tags">
                  {post.tags.map((tag) => (
                    <Link key={tag} to={`/news?tag=${encodeURIComponent(tag)}`} className="blog-tag">
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <BlogComments postId={post.id} />

          {/* Соседние посты — сдержанные текстовые ссылки, а не отдельные карточки. */}
          {(adjacentPosts.newer || adjacentPosts.older) && (
            <nav className="blog-post-nav" aria-label="Adjacent posts">
              {adjacentPosts.newer && (
                <Link className="blog-post-nav__link" to={`/news/${adjacentPosts.newer.slug}`}>
                  ← Newer post: <span>{adjacentPosts.newer.title}</span>
                </Link>
              )}
              {adjacentPosts.older && (
                <Link className="blog-post-nav__link blog-post-nav__link--right" to={`/news/${adjacentPosts.older.slug}`}>
                  Older post: <span>{adjacentPosts.older.title}</span> →
                </Link>
              )}
            </nav>
          )}

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
                <p className="muted">No related posts yet. Explore all the news for more articles.</p>
                <Link className="btn btn-outline" to="/news">
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
