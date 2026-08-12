import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faCompass,
    faFilter,
    faGamepad,
    faMagnifyingGlass,
    faShieldHalved,
    faWandMagicSparkles,
    faTags,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import {Link, useLocation} from "react-router-dom";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type {IBlogService} from "../../iterfaces/i-blog-service";
import type {BlogEngagementSummary, BlogListItem, BlogRecommendationsResponse} from "../../types/blog";
import PostCard from "../../pages/blog/components/PostCard";
import {getAnonId, getSessionId} from "../../hooks/use-blog-tracking";
import {subscribeNewsletter} from "../../api/newsletterApi";
import {
    rememberNewsletterSubscription,
    useKnownNewsletterSubscription
} from "../../hooks/use-newsletter-subscribed";
import "./blog-page.css";

const RECOMMENDATION_LIMIT = 8;
/**
 * Размер порции ленты. Строка-карточка высокая (~250px), так что четыре штуки — это
 * примерно полтора экрана: следующая порция успевает приехать за пол-экрана до конца,
 * и швов между порциями не видно. Заодно подгрузку видно уже на маленьком блоге.
 */
const POSTS_PAGE_SIZE = 4;
const sortOptions = ["Newest", "Most popular", "Editor's picks"] as const;

type SortOption = (typeof sortOptions)[number];

type LoadedData = {
    recommendations: BlogRecommendationsResponse | null;
    featuredPool: BlogListItem[];
    fallbackPosts: BlogListItem[];
};

const uniqById = (posts: BlogListItem[]): BlogListItem[] => {
    const seen = new Set<string>();
    const result: BlogListItem[] = [];
    posts.forEach((post) => {
        if (!seen.has(post.id)) {
            seen.add(post.id);
            result.push(post);
        }
    });
    return result;
};

const toTime = (publishedAt?: string) => (publishedAt ? new Date(publishedAt).getTime() : 0);

const sortByNewest = (posts: BlogListItem[]) => [...posts].sort((a, b) => toTime(b.publishedAt) - toTime(a.publishedAt));

const sortPosts = (posts: BlogListItem[], sort: SortOption, popularIds: string[], editorIds: string[]): BlogListItem[] => {
    if (sort === "Newest") {
        return sortByNewest(posts);
    }

    if (sort === "Most popular") {
        const rankMap = new Map(popularIds.map((id, index) => [id, index]));
        return [...posts].sort((a, b) => {
            const rankA = rankMap.has(a.id) ? rankMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const rankB = rankMap.has(b.id) ? rankMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
            if (rankA !== rankB) {
                return rankA - rankB;
            }
            return toTime(b.publishedAt) - toTime(a.publishedAt);
        });
    }

    const rankMap = new Map(editorIds.map((id, index) => [id, index]));
    return [...posts].sort((a, b) => {
        const rankA = rankMap.has(a.id) ? rankMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const rankB = rankMap.has(b.id) ? rankMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
            return rankA - rankB;
        }
        return toTime(b.publishedAt) - toTime(a.publishedAt);
    });
};

const tagIcons: Record<string, typeof faWandMagicSparkles> = {
    Deals: faTags,
    Guides: faCompass,
    Reviews: faGamepad,
    Security: faShieldHalved,
    Updates: faWandMagicSparkles
};

const getTagIcon = (tag: string) => {
    return tagIcons[tag] ?? faWandMagicSparkles;
};

export default function BlogPage() {
    const blogService = container.get<IBlogService>(IDENTIFIERS.IBlogService);
    const location = useLocation();
    // Выбранные теги. Пустой список — «All». Мультивыбор: у поста тегов несколько,
    // и фильтр «только один тег за раз» заставлял выбирать между Guides и Support.
    const [activeTags, setActiveTags] = useState<string[]>([]);

    // Подписка на еженедельный дайджест из нижнего баннера.
    // "pending" — гостю ушло письмо-подтверждение; "confirmed" — владелец аккаунта, подписан сразу.
    const [newsletterEmail, setNewsletterEmail] = useState("");
    const [newsletterStatus, setNewsletterStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
    const [newsletterResult, setNewsletterResult] = useState<"pending" | "confirmed">("pending");
    const knownSubscription = useKnownNewsletterSubscription();
    const [searchInput, setSearchInput] = useState("");
    const [sort, setSort] = useState<SortOption>("Newest");
    const [data, setData] = useState<LoadedData>({
        recommendations: null,
        featuredPool: [],
        fallbackPosts: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [headerOffset, setHeaderOffset] = useState(88);
    const [engagementMap, setEngagementMap] = useState<Record<string, BlogEngagementSummary>>({});
    const [refreshTick, setRefreshTick] = useState(0);
    const debouncedSearch = useDebouncedValue(searchInput, 320);

    // Догруженные прокруткой страницы ленты (вторая и дальше). Первая живёт в data.fallbackPosts.
    const [extraPosts, setExtraPosts] = useState<BlogListItem[]>([]);
    const [totalPosts, setTotalPosts] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const feedPageRef = useRef(1);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    // «Прилипла» ли панель фильтров. В покое это карточка среди карточек, а при
    // прокрутке она сворачивается в маленькую таблетку: полноразмерная панель,
    // висящая поверх постов, читалась как оторванный кусок интерфейса.
    const [isToolbarStuck, setIsToolbarStuck] = useState(false);
    // Развёрнута ли панель ИЗ таблетки. Живёт отдельно от прилипания: клик по таблетке
    // раскрывает полную панель на месте, клик мимо или Escape сворачивает обратно.
    const [isPillExpanded, setIsPillExpanded] = useState(false);
    const stuckSentinelRef = useRef<HTMLDivElement | null>(null);
    const toolbarWrapRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const sentinel = stuckSentinelRef.current;
        if (!sentinel) {
            return;
        }

        const stickLine = headerOffset + 12;
        const observer = new IntersectionObserver(
            // «Прилипла» = метка ушла ЗА линию шапки. Сравнивать надо именно с линией
            // (top <= stickLine), а не с верхом окна: датчик перестаёт пересекаться уже
            // на линии и больше событий не шлёт — условие «top < 0» не наступало никогда,
            // и таблетка не появлялась вовсе.
            ([entry]) => setIsToolbarStuck(!entry.isIntersecting && entry.boundingClientRect.top <= stickLine),
            { rootMargin: `-${stickLine}px 0px 0px 0px`, threshold: 0 }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [headerOffset]);

    // Вернулись к началу страницы — таблетки больше нет, развёрнутость сбрасывается.
    useEffect(() => {
        if (!isToolbarStuck) {
            setIsPillExpanded(false);
        }
    }, [isToolbarStuck]);

    // Развёрнутая из таблетки панель ведёт себя как всплывающая: клик мимо неё
    // или Escape сворачивают обратно — иначе она снова зависала бы над постами.
    useEffect(() => {
        if (!isToolbarStuck || !isPillExpanded) {
            return;
        }

        const onOutsideClick = (event: MouseEvent) => {
            if (toolbarWrapRef.current && !toolbarWrapRef.current.contains(event.target as Node)) {
                setIsPillExpanded(false);
            }
        };
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsPillExpanded(false);
            }
        };

        document.addEventListener("mousedown", onOutsideClick);
        document.addEventListener("keydown", onEscape);
        return () => {
            document.removeEventListener("mousedown", onOutsideClick);
            document.removeEventListener("keydown", onEscape);
        };
    }, [isToolbarStuck, isPillExpanded]);

    useEffect(() => {
        const updateHeaderOffset = () => {
            const header = document.querySelector(".site-header") as HTMLElement | null;
            const nextOffset = header?.offsetHeight ?? 96;
            setHeaderOffset(nextOffset + 10);
        };

        updateHeaderOffset();
        window.addEventListener("resize", updateHeaderOffset);
        return () => window.removeEventListener("resize", updateHeaderOffset);
    }, []);

    useEffect(() => {
        const handleFocus = () => setRefreshTick((value) => value + 1);
        window.addEventListener("focus", handleFocus);
        window.addEventListener("pageshow", handleFocus);
        return () => {
            window.removeEventListener("focus", handleFocus);
            window.removeEventListener("pageshow", handleFocus);
        };
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            const [recommendationsResult, featuredResult, fallbackResult] = await Promise.allSettled([
                blogService.getHomeRecommendations({anonId: getAnonId(), limit: RECOMMENDATION_LIMIT}),
                blogService.getPosts({page: 1, pageSize: 6, featured: true}),
                blogService.getPosts({page: 1, pageSize: POSTS_PAGE_SIZE})
            ]);

            const recommendations = recommendationsResult.status === "fulfilled" ? recommendationsResult.value : null;
            const featuredPool = featuredResult.status === "fulfilled" ? featuredResult.value.items : [];
            const fallbackPosts = fallbackResult.status === "fulfilled" ? fallbackResult.value.items : [];

            // Перезагрузка страницы начинает ленту заново — накопленные прокруткой
            // страницы к новому списку уже не относятся.
            feedPageRef.current = 1;
            setExtraPosts([]);
            setTotalPosts(fallbackResult.status === "fulfilled" ? fallbackResult.value.total : fallbackPosts.length);

            if (!recommendations && fallbackPosts.length === 0 && featuredPool.length === 0) {
                setError("Unable to load blog posts right now.");
            } else if (recommendationsResult.status === "rejected" || featuredResult.status === "rejected" || fallbackResult.status === "rejected") {
                setError("Some recommendations are unavailable, showing latest published posts.");
            }

            setData({recommendations, featuredPool, fallbackPosts});
            setLoading(false);
        };

        fetchData();
    }, [blogService, location.key, refreshTick]);

    const featuredPost = useMemo(() => {
        return data.recommendations?.heroPost
            ?? data.featuredPool[0]
            ?? data.recommendations?.editorsPicks[0]
            ?? data.recommendations?.latestPosts[0]
            ?? data.fallbackPosts[0];
    }, [data]);

    const compactEditorPicks = useMemo(() => {
        const picks = uniqById([
            ...(data.recommendations?.editorsPicks ?? []),
            ...data.featuredPool,
            ...(data.recommendations?.forYou ?? []),
            ...data.fallbackPosts
        ]);

        const withoutFeatured = featuredPost ? picks.filter((post) => post.id !== featuredPost.id) : picks;
        const finalPicks = withoutFeatured.length >= 3 ? withoutFeatured : picks;
        return finalPicks.slice(0, 3);
    }, [data, featuredPost]);

    /**
     * Лента — ТОЛЬКО постраничный список с сервера. Раньше сюда подмешивались списки
     * рекомендаций, и это дважды ломало страницу: рекомендации приносят до восьми постов
     * разом (порционная подгрузка теряла смысл — всё видно с первого экрана), а их
     * пересечение с запасным списком однажды дало каждый пост по два раза.
     * Рекомендации остались там, где им место, — в ранжировании сортировок ниже.
     */
    const baseFeed = useMemo(
        () => uniqById([...data.fallbackPosts, ...extraPosts]),
        [data.fallbackPosts, extraPosts]
    );

    const loadedFeedCount = data.fallbackPosts.length + extraPosts.length;
    const hasMorePosts = loadedFeedCount < totalPosts;

    /**
     * Следующая порция ленты. Зовётся, когда метка конца списка попадает в экран.
     * Порция может целиком оказаться дублями рекомендаций — тогда видимого прироста
     * не будет, но счётчик страниц сдвинется и следующий вызов возьмёт дальше.
     */
    const loadMorePosts = useCallback(async () => {
        if (loading || loadingMore || !hasMorePosts) {
            return;
        }

        setLoadingMore(true);
        try {
            const nextPage = feedPageRef.current + 1;
            const response = await blogService.getPosts({page: nextPage, pageSize: POSTS_PAGE_SIZE});
            feedPageRef.current = nextPage;
            setExtraPosts((previous) => uniqById([...previous, ...response.items]));
            setTotalPosts(response.total);
        } catch (loadError) {
            // Не дотянулись — метка останется на экране, и прокрутка попробует ещё раз.
            console.warn("Failed to load more posts", loadError);
        } finally {
            setLoadingMore(false);
        }
    }, [blogService, hasMorePosts, loading, loadingMore]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMorePosts) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadMorePosts();
                }
            },
            // Начинаем грузить за пол-экрана до конца: к моменту, когда человек
            // долистает, посты уже на месте и лента не «упирается».
            {rootMargin: "50% 0px"}
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMorePosts, loadMorePosts]);

    useEffect(() => {
        const fetchEngagement = async () => {
            const anonId = getAnonId();
            const ids = uniqById([
                ...baseFeed,
                ...compactEditorPicks,
                ...(featuredPost ? [featuredPost] : [])
            ]).map((post) => post.id);

            if (!ids.length) {
                setEngagementMap({});
                return;
            }

            try {
                const items = await blogService.getEngagementSummary(ids, anonId);
                const nextMap = items.reduce<Record<string, BlogEngagementSummary>>((acc, item) => {
                    acc[item.postId] = item;
                    return acc;
                }, {});
                setEngagementMap(nextMap);
            } catch (engagementError) {
                console.warn("Failed to load engagement summary", engagementError);
            }
        };

        fetchEngagement();
    }, [baseFeed, blogService, compactEditorPicks, featuredPost]);

    const tagFilters = useMemo(() => {
        const allTags = new Set<string>();
        [...baseFeed, ...compactEditorPicks, ...(featuredPost ? [featuredPost] : [])]
            .forEach((post) => post.tags.forEach((tag) => allTags.add(tag)));
        return ["All", ...Array.from(allTags).slice(0, 8)];
    }, [baseFeed, compactEditorPicks, featuredPost]);

    const filteredFeed = useMemo(() => {
        const q = debouncedSearch.trim().toLowerCase();
        const filtered = baseFeed.filter((post) => {
            // Достаточно совпадения по ЛЮБОМУ из выбранных тегов: отметив Guides и Deals,
            // человек расширяет выдачу, а не требует постов сразу с обоими тегами.
            const matchesTag = activeTags.length === 0 || post.tags.some((tag) => activeTags.includes(tag));
            if (!matchesTag) {
                return false;
            }

            if (!q) {
                return true;
            }

            const haystack = `${post.title} ${post.excerpt} ${post.tags.join(" ")}`.toLowerCase();
            return haystack.includes(q);
        });

        const popularIds = (data.recommendations?.popularThisWeek ?? []).map((post) => post.id);
        const editorIds = uniqById([...(data.recommendations?.editorsPicks ?? []), ...compactEditorPicks]).map((post) => post.id);

        return sortPosts(filtered, sort, popularIds, editorIds);
    }, [activeTags, baseFeed, compactEditorPicks, data.recommendations, debouncedSearch, sort]);

    const isFiltering = activeTags.length > 0 || debouncedSearch.trim().length > 0;

    // Число на таблетке: сколько условий сейчас сужает ленту (теги + поиск).
    const activeFilterCount = activeTags.length + (debouncedSearch.trim() ? 1 : 0);
    const showFeedEmpty = !loading && isFiltering && filteredFeed.length === 0;

    const toolbarSummary = useMemo(() => {
        if (!isFiltering) {
            return `Showing ${filteredFeed.length} posts`;
        }

        const parts = [`${filteredFeed.length} results`];
        if (activeTags.length > 0) {
            parts.push(`tags: ${activeTags.join(", ")}`);
        }
        if (debouncedSearch.trim()) {
            parts.push(`search: “${debouncedSearch.trim()}”`);
        }
        return parts.join(" • ");
    }, [activeTags, debouncedSearch, filteredFeed.length, isFiltering]);

    const handleClearFilters = () => {
        setSearchInput("");
        setActiveTags([]);
    };

    const handleNewsletterSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const email = newsletterEmail.trim();
        if (!email || newsletterStatus === "sending") {
            return;
        }

        setNewsletterStatus("sending");
        try {
            const status = await subscribeNewsletter(email, "news");
            rememberNewsletterSubscription(status);
            setNewsletterResult(status === "confirmed" ? "confirmed" : "pending");
            setNewsletterStatus("done");
        } catch (subscribeError) {
            console.warn("Failed to subscribe from news page", subscribeError);
            setNewsletterStatus("error");
        }
    };

    /** «All» очищает выбор; любой другой тег добавляется или снимается кликом. */
    const toggleTag = (tag: string) => {
        if (tag === "All") {
            setActiveTags([]);
            return;
        }

        setActiveTags((previous) =>
            previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag]
        );
    };

    const handleReaction = async (postId: string, reaction: string) => {
        try {
            const summary = await blogService.setReaction({
                postId,
                reaction,
                anonId: getAnonId(),
                sessionId: getSessionId()
            });
            setEngagementMap((prev) => ({...prev, [postId]: summary}));
        } catch (reactionError) {
            console.warn("Failed to set reaction", reactionError);
        }
    };

    return (
        <main
            className="blog-page"
            style={{
                ["--blog-header-offset" as string]: `${headerOffset}px`
            }}
        >
            {/* Шапка в одну строку, как у каталога: заголовок и подпись на одной базовой линии.
                Плакатная плашка и этажерка «Featured + Top picks» убраны: они трижды
                повторяли посты из ленты и отодвигали саму ленту за экран. */}
            <section className="blog-hero section">
                <div className="container">
                    <div className="blog-head">
                        <h1>News &amp; guides</h1>
                        <span className="blog-head__sub">weekly picks and updates from Tale Shop</span>
                    </div>
                </div>
            </section>

            <div ref={stuckSentinelRef} aria-hidden="true" />
            <section
                ref={toolbarWrapRef}
                className={`blog-toolbar-wrap section${isToolbarStuck ? " is-stuck" : ""}`}
            >
                <div className="container">
                    {isToolbarStuck && !isPillExpanded ? (
                        /* Свёрнутое состояние: маленькая таблетка вместо панели во всю ширину.
                           Показывает суть — поиск, фильтр со счётчиком включённого и текущий
                           порядок; клик разворачивает полную панель на месте. */
                        <button
                            type="button"
                            className="blog-toolbar-pill"
                            aria-expanded={false}
                            aria-label="Show search and filters"
                            onClick={() => setIsPillExpanded(true)}
                        >
                            {/* Вертикальная колонка из двух иконок — без подписи сортировки:
                                в узком поле у края окна текст не помещается, а суть
                                («здесь поиск и фильтры, включено N») передают значки. */}
                            <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                            <span className="blog-toolbar-pill__divider" aria-hidden="true" />
                            <FontAwesomeIcon icon={faFilter} aria-hidden="true" />
                            {activeFilterCount > 0 && (
                                <span className="blog-toolbar-pill__count">{activeFilterCount}</span>
                            )}
                        </button>
                    ) : (
                    <div className={`blog-toolbar surface${isToolbarStuck ? " blog-toolbar--floating" : ""}`}>
                        {/* Кнопка «свернуть» существует только у панели, развёрнутой из таблетки. */}
                        {isToolbarStuck && (
                            <button
                                type="button"
                                className="blog-toolbar__collapse"
                                aria-label="Collapse filters"
                                onClick={() => setIsPillExpanded(false)}
                            >
                                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                            </button>
                        )}
                        <label className="search-field" aria-label="Search articles">
                            <FontAwesomeIcon icon={faMagnifyingGlass} />
                            <input
                                type="search"
                                placeholder="Search articles..."
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                // Фокус сразу в поле, но ТОЛЬКО когда панель развернули из
                                // таблетки: сама кнопка-таблетка к этому моменту исчезла из
                                // документа, и без переноса фокус улетал в пустоту.
                                // При обычной загрузке страницы прилипания нет — автофокус молчит.
                                autoFocus={isToolbarStuck}
                            />
                        </label>

                        <div className="chip-row" role="list">
                            {tagFilters.map((tag) => {
                                const isActive = tag === "All" ? activeTags.length === 0 : activeTags.includes(tag);
                                return (
                                    <button
                                        key={tag}
                                        className={`chip ${isActive ? "chip-active" : ""}`}
                                        onClick={() => toggleTag(tag)}
                                        type="button"
                                        role="listitem"
                                        aria-pressed={isActive}
                                    >
                                        {tag !== "All" ? <FontAwesomeIcon icon={getTagIcon(tag)} /> : null}
                                        <span>{tag}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <label className="sort-select">
                            <span className="visually-hidden">Sort posts</span>
                            <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}>
                                {sortOptions.map((option) => (
                                    <option key={option}>{option}</option>
                                ))}
                            </select>
                        </label>

                        {isFiltering ? (
                            <button className="btn btn-outline blog-toolbar__clear" type="button" onClick={handleClearFilters}>
                                Clear filters
                            </button>
                        ) : null}

                        <p className="blog-toolbar__summary muted">{toolbarSummary}</p>
                    </div>
                    )}
                </div>
            </section>

            <section className="blog-feed section">
                <div className="container">
                    {error ? <p className="blog-feed__warning">{error}</p> : null}

                    {loading ? (
                        <div className="posts-grid posts-grid--rows">
                            {Array.from({length: 4}).map((_, index) => (
                                <div className="post-card post-card--row" key={`feed-skeleton-${index}`}>
                                    <div className="post-card__media post-card__media--row"><div className="skeleton h-32" /></div>
                                    <div className="post-card__body post-card__body--row"><div className="skeleton h-6" /><div className="skeleton h-4 mt-3" /></div>
                                </div>
                            ))}
                        </div>
                    ) : showFeedEmpty ? (
                        <div className="blog-feed-empty surface">
                            <h3>No posts found</h3>
                            <p className="muted">Try changing search text or selecting another topic.</p>
                            <button className="btn btn-primary" type="button" onClick={handleClearFilters}>Clear filters</button>
                        </div>
                    ) : filteredFeed.length > 0 ? (
                        <>
                            {/* Одна новость — одна широкая строка на весь объём, обложка сбоку;
                                стороны чередуются, как в новостных лентах магазинов. */}
                            <div className="posts-grid posts-grid--rows">
                                {filteredFeed.map((post, index) => (
                                    <PostCard
                                        key={`feed-${post.id}-${index}`}
                                        post={post}
                                        variant="row"
                                        engagement={engagementMap[post.id]}
                                        onReact={handleReaction}
                                    />
                                ))}
                            </div>

                            {/* Вставки «Picked by Tale team» здесь больше нет: она повторяла
                                пост, который и так виден в «Top picks» выше, и разбивала ленту. */}

                            {/* Невидимая метка конца ленты: как только она попадает в экран,
                                догружается следующая порция постов. */}
                            <div ref={sentinelRef} className="blog-feed__sentinel" aria-hidden="true" />
                            {loadingMore && <p className="blog-feed__loading muted">Loading more posts…</p>}
                        </>
                    ) : (
                        <div className="blog-feed-empty surface">
                            <h3>The newsroom is preparing new stories</h3>
                            <p className="muted">Check back soon for fresh posts and updates.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Баннер обещает «одно письмо в неделю» — значит, здесь и подписывают.
                Раньше под этим текстом стояли кнопки в магазин: обещание одно, действие другое. */}
            <section className="cta-strip section">
                <div className="container">
                    <div className="cta-card">
                        <div className="cta-copy">
                            <h2>Looking for this week’s best prices?</h2>
                            <p>One email per week. No spam. Unsubscribe anytime.</p>
                        </div>
                        {knownSubscription || newsletterStatus === "done" ? (
                            <p className="cta-done">
                                {knownSubscription === "confirmed" || newsletterResult === "confirmed"
                                    ? "You’re on the list — the next digest is coming your way."
                                    : "Almost there — confirm the link we just emailed you."}
                            </p>
                        ) : (
                            <form className="cta-form" onSubmit={handleNewsletterSubmit}>
                                <input
                                    type="email"
                                    required
                                    placeholder="you@example.com"
                                    aria-label="Email for the weekly digest"
                                    value={newsletterEmail}
                                    onChange={(event) => setNewsletterEmail(event.target.value)}
                                />
                                <button className="btn btn-primary" type="submit" disabled={newsletterStatus === "sending"}>
                                    {newsletterStatus === "sending" ? "Subscribing…" : "Subscribe"}
                                </button>
                                {newsletterStatus === "error" && (
                                    <p className="cta-error">Could not subscribe right now — try again in a minute.</p>
                                )}
                            </form>
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}
