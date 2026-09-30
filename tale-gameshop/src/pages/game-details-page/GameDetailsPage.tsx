import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { isSoftware, productHref, softwareCatalogPath } from '../../utils/software';
import { kindLabels } from '../../utils/product-kind-labels';
import { useSoftwareCategories } from '../../hooks/use-software-categories';
import { ActivationCard, CompareLicensesCard } from './components/SoftwareLicenses';
import './game-details-page.css';
import type { GameDetailsResponse, RatingBreakdownItem, ReviewTag } from '../../types/game-details';
import IDENTIFIERS from '../../constants/identifiers';
import container from '../../inversify.config';
import type { IGameDetailsService } from '../../iterfaces/i-game-details-service';
import { getAnonId } from '../../hooks/use-blog-tracking';
import NotFoundPage from '../../components/utils/not-found-page/not-found-page';
import PageMeta from '../../components/common/PageMeta';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import { slugify } from '../../utils/slugify';
import { useSitePreferences } from '../../context/site-preferences';
import GameHero, { orderMedia } from './components/GameHero';
import GameAbout from './components/GameAbout';
import PurchaseCard from './components/PurchaseCard';
import GameTabs, { type GameTabDef, type GameTabId } from './components/GameTabs';
import OverviewTab from './components/OverviewTab';
import ReviewsTab from './components/ReviewsTab';
import SystemRequirementsTab, { hasSystemRequirements } from './components/SystemRequirementsTab';
import RecommendationsCarousel from './components/RecommendationsCarousel';
import GameDetailsSkeleton from './components/GameDetailsSkeleton';
import { ratingLabelFor } from './components/shared';
import { analyticsClient } from '../../utils/analytics-client';
import { useKeycloak } from '@react-keycloak/web';

const TAB_IDS: GameTabId[] = ['overview', 'reviews', 'system-requirements'];

const GameDetailsPage: React.FC = () => {
  const { t } = useTranslation();
  // Страна — в заголовке каждого запроса; при её смене карточку перечитываем: регион активации зависит от неё.
  const { currency: siteCurrency, country: buyerCountry } = useSitePreferences();
  const { slug } = useParams<{ slug: string }>();
  const softwareCategories = useSoftwareCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<GameDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Несуществующая игра (404 от API) — это не «ошибка», а страница, которой нет: показываем магазинную 404.
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedEditionId, setSelectedEditionId] = useState('');

  // Вход — через реактивный хук, а не снимок из сервиса при рендере: раньше страница, отрисованная до
  // конца тихой проверки сессии Keycloak, навсегда считала человека гостем, и каждый клик по «Helpful»
  // или «Report» уводил на вход, откуда Keycloak тут же возвращал — «страница перезагружается».
  const { keycloak, initialized: keycloakReady } = useKeycloak();
  const isAuthenticated = Boolean(keycloakReady && keycloak?.authenticated);
  // Данные уже на экране — повторная загрузка (смена входа) идёт без скелетона.
  const dataRef = useRef<GameDetailsResponse | null>(null);
  const gameDetailsService = useMemo(() => container.get<IGameDetailsService>(IDENTIFIERS.IGameDetailsService), []);

  // Активная вкладка живёт в URL: `?tab=reviews` — прямая ссылка на отзывы.
  const tabParam = searchParams.get('tab');
  const activeTab: GameTabId = TAB_IDS.includes(tabParam as GameTabId) ? (tabParam as GameTabId) : 'overview';
  const setActiveTab = useCallback(
    (id: GameTabId) => {
      const next = new URLSearchParams(searchParams);
      // Номер страницы отзывов принадлежит вкладке Reviews — в другой вкладке он не нужен.
      next.delete('page');
      if (id === 'overview') {
        next.delete('tab');
      } else {
        next.set('tab', id);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Клик по рейтингу под названием: вкладка Reviews + прокрутка к вкладкам. Вкладки ниже галереи,
  // и без прокрутки переключение не видно — кажется, что клик ничего не сделал.
  const tabsAnchorRef = useRef<HTMLDivElement | null>(null);
  const openReviews = useCallback(() => {
    setActiveTab('reviews');
    tabsAnchorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [setActiveTab]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (!slug) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }
      try {
        if (!dataRef.current) setIsLoading(true);
        setError(null);
        setNotFound(false);
        const response = await gameDetailsService.getGameDetails(slug, siteCurrency);
        if (isMounted) {
          dataRef.current = response;
          setData(response);
          if (response.game.editions?.length > 0) {
            const defaultEdition = response.game.editions.find((edition) => edition.isDefault) ?? response.game.editions[0];
            setSelectedEditionId(defaultEdition.code);
          }
        }
      } catch (err: any) {
        console.error('Failed to load game details', err);
        if (isMounted) {
          if (err?.response?.status === 404) {
            setNotFound(true);
          } else {
            setError(t('product.loadFailed'));
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [gameDetailsService, slug, reloadKey, siteCurrency, buyerCountry, isAuthenticated]);

  useEffect(() => {
    if (!data?.game?.gameId) {
      return;
    }
    gameDetailsService.trackGameView({ gameId: data.game.gameId, anonId: getAnonId() });
    // view_item для GA — начало воронки до add_to_cart (карточка покупки) и begin_checkout (чекаут).
    if (data.pricing) {
      analyticsClient.trackEcommerce('view_item', {
        currency: data.pricing.currency,
        value: data.pricing.price,
        items: [{ item_id: data.game.gameId, item_name: data.game.title, price: data.pricing.price, quantity: 1 }]
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.game?.gameId, gameDetailsService]);

  // Сброс вкладки при переходе на другую игру — иначе с «Reviews» одной игры попадаешь в «Reviews» другой.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  if (isLoading && !data) {
    return <GameDetailsSkeleton />;
  }

  if (notFound) {
    return <NotFoundPage />;
  }

  if (error || !data) {
    return (
      <main className="game-details-page">
        <div className="container">
          <div className="gd-error card">
            <div className="gd-error__icon">😕</div>
            <h2>{t('errorBoundary.title')}</h2>
            <p>{error ?? t('product.loadFailed')}</p>
            <button type="button" className="btn btn-primary" onClick={() => setReloadKey((prev) => prev + 1)}>
              {t('common.tryAgain')}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const { game } = data;
  const software = isSoftware(data.kind);
  // Адрес товара у игр и софта один: /games/{slug}. Старые /software/{slug} уводит на него маршрут.
  const productPath = productHref({ slug });

  const editions = game.editions ?? [];
  const selectedEdition = editions.find((edition) => edition.code === selectedEditionId);
  // Цена — из ответа сервера, посчитанная для валюты витрины (ручная → курс → нет). Для выбранного
  // издания — из editionPricing по тем же правилам. null — в этой валюте не продаётся.
  const displayPricing = selectedEdition && editions.length > 1 ? (data.editionPricing?.[selectedEdition.code] ?? null) : (data.pricing ?? null);
  const media = orderMedia(game);

  const ratingSummary = {
    average: data.ratingSummary.avg,
    totalReviews: data.ratingSummary.count,
    label: ratingLabelFor(data.ratingSummary.avg, data.ratingSummary.count)
  };
  const ratingBreakdown: RatingBreakdownItem[] = [5, 4, 3, 2, 1].map((rating) => {
    const count = data.ratingSummary.distribution?.[rating.toString()] ?? 0;
    const percent = data.ratingSummary.count ? Math.round((count / data.ratingSummary.count) * 100) : 0;
    return { rating, percent };
  });
  const reviewTags: ReviewTag[] = (game.tags ?? []).slice(0, 3).map((tag, index) => ({ id: `${index}-${tag}`, label: data.tagLabels?.[index] ?? tag }));

  const tabs: GameTabDef[] = [
    { id: 'overview', label: t('product.tabs.overview') },
    { id: 'reviews', label: t('product.tabs.reviews'), count: data.ratingSummary.count },
    ...(hasSystemRequirements(game.systemRequirements) ? [{ id: 'system-requirements' as const, label: t('product.tabs.sysreq') }] : [])
  ];
  const effectiveTab: GameTabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'overview';

  /**
   * Разметка товара для поисковиков: цена и звёзды рядом со ссылкой в выдаче. Оценка — только когда
   * отзывы есть: нулевой рейтинг поисковик считает недостоверным и бракует всю разметку.
   */
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const productStructuredData: Record<string, unknown> = {
    '@type': 'Product',
    name: game.title,
    description: game.tagline || game.title,
    ...(game.cover?.url ? { image: game.cover.url } : {}),
    ...(game.developer?.name ? { brand: { '@type': 'Brand', name: game.developer.name } } : {}),
    ...(displayPricing
      ? {
          offers: {
            '@type': 'Offer',
            price: displayPricing.price,
            priceCurrency: displayPricing.currency,
            availability: data.isComingSoon
              ? 'https://schema.org/PreOrder'
              : data.availability?.status === 'outOfStock'
                ? 'https://schema.org/OutOfStock'
                : 'https://schema.org/InStock',
            ...(displayPricing.discountEndsAt ? { priceValidUntil: displayPricing.discountEndsAt } : {}),
            url: `${origin}${productPath}`
          }
        }
      : {}),
    ...(data.ratingSummary.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: data.ratingSummary.avg, reviewCount: data.ratingSummary.count } }
      : {})
  };
  // Описание для поисковиков: тэглайн, иначе первые ~160 символов описания без markdown-разметки,
  // иначе общая фраза — раньше у игр без тэглайна шла одна и та же заглушка.
  const metaDescription =
    game.tagline?.trim() ||
    (game.descriptionMarkdown || '')
      .replace(/[#*_>`[\]()!-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160) ||
    t('product.metaDesc', { title: game.title });
  const softwareCategoryEntry = software
    ? softwareCategories.categories.find((category) => category.tag === data.softwareCategory)
    : undefined;
  const softwareCategoryTitle = softwareCategoryEntry?.label ?? softwareCategoryEntry?.title;
  const breadcrumbItems = software
    ? [
        { label: t('common.nav.home'), to: '/' },
        { label: t('common.nav.software'), to: softwareCatalogPath() },
        ...(data.softwareCategory && softwareCategoryTitle
          ? [{ label: softwareCategoryTitle, to: softwareCatalogPath(data.softwareCategory) }]
          : []),
        { label: game.title }
      ]
    : [
        { label: t('common.nav.home'), to: '/' },
        { label: t('product.gameKeys'), to: '/games' },
        ...(game.genres?.[0] ? [{ label: data.genreLabels?.[0] ?? game.genres[0], to: `/games/category/${slugify(game.genres[0])}` }] : []),
        { label: game.title }
      ];
  const breadcrumbStructuredData = {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...('to' in item && item.to ? { item: `${origin}${item.to}` } : {})
    }))
  };

  return (
    <main className="game-details-page">
      <PageMeta
        title={game.title}
        description={metaDescription}
        canonicalPath={productPath}
        imageUrl={game.cover?.url}
        ogType="product"
        structuredData={{ '@context': 'https://schema.org', '@graph': [productStructuredData, breadcrumbStructuredData] }}
      />
      <div className="container game-details-container">
        <Breadcrumbs items={breadcrumbItems} />

        <GameHero
          game={game}
          media={media}
          software={software}
          genreLabels={data.genreLabels}
          tagLabels={data.tagLabels}
          rating={{ summary: ratingSummary, isTopRated: game.isTopRated, onClick: openReviews }}
          onMediaPlay={(item) => {
            gameDetailsService.trackMediaPlay({ gameId: game.gameId, mediaId: item.id, mediaType: item.type, anonId: getAnonId() });
          }}
          purchase={
            <PurchaseCard
              gameId={game.gameId}
              slug={game.slug || slug}
              gameTitle={game.title}
              coverUrl={game.cover?.url}
              pricing={displayPricing}
              siteCurrency={siteCurrency}
              editions={editions}
              editionPricing={data.editionPricing ?? {}}
              editionAvailability={data.editionAvailability}
              selectedEditionCode={selectedEditionId}
              onSelectEdition={setSelectedEditionId}
              availability={data.availability}
              parentGame={data.parentGame}
              regionInfo={data.regionInfo}
              regionOffers={data.regionOffers}
              keyType={game.keyType}
              isComingSoon={data.isComingSoon}
              releaseDate={game.releaseDate}
              software={software}
              activation={game.activation}
            />
          }
          about={
            <GameAbout
              descriptionMarkdown={game.descriptionMarkdown}
              features={game.keyFeatures ?? []}
              awards={game.awards ?? []}
              noun={kindLabels(software).noun}
            />
          }
        />

        <div className="gd-tabs-anchor" ref={tabsAnchorRef}>
        <GameTabs tabs={tabs} active={effectiveTab} onChange={setActiveTab} />

        <div id={`panel-${effectiveTab}`} role="tabpanel" aria-labelledby={`tab-${effectiveTab}`}>
          {effectiveTab === 'overview' && (
            <OverviewTab
              game={game}
              dlc={data.dlc ?? []}
              software={software}
              softwareBlocks={
                software ? (
                  <>
                    <CompareLicensesCard
                      editions={editions}
                      editionPricing={data.editionPricing ?? {}}
                      editionAvailability={data.editionAvailability}
                      selectedCode={selectedEditionId}
                      onSelect={setSelectedEditionId}
                    />
                    <ActivationCard activation={game.activation} subscription={Boolean(selectedEdition?.isSubscription)} />
                  </>
                ) : null
              }
            />
          )}
          {effectiveTab === 'reviews' && (
            <ReviewsTab
              gameId={game.gameId}
              service={gameDetailsService}
              ratingSummary={ratingSummary}
              breakdown={ratingBreakdown}
              tags={reviewTags}
              isAuthenticated={isAuthenticated}
              userContext={data.userContext}
              onReviewsChanged={() => setReloadKey((prev) => prev + 1)}
            />
          )}
          {effectiveTab === 'system-requirements' && <SystemRequirementsTab requirements={game.systemRequirements} />}
        </div>
        </div>

        {data.recommendations?.moreLikeThis?.length > 0 && (
          <section className="game-details-section">
            <RecommendationsCarousel items={data.recommendations.moreLikeThis} software={software} />
          </section>
        )}
      </div>
    </main>
  );
};

export default GameDetailsPage;
