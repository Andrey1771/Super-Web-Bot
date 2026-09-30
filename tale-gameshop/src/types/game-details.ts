export interface GameDetails {
  id?: string;
  gameId: string;
  slug: string;
  title: string;
  tagline: string;
  /** Переводы полей по языкам сайта (ru/uk/pl); английское — основное поле. Витрина получает уже подставленный текст. */
  taglineI18n?: Record<string, string> | null;
  descriptionMarkdown: string;
  descriptionMarkdownI18n?: Record<string, string> | null;
  cover?: GameCover;
  gallery: MediaItem[];
  genres: string[];
  /** Переводы жанров и тегов по позициям (ru/uk/pl); значения остаются английскими. */
  genresI18n?: Record<string, string[]> | null;
  tags: string[];
  tagsI18n?: Record<string, string[]> | null;
  developer?: GameStudioInfo;
  publisher?: GameStudioInfo;
  releaseDate?: string;
  platforms: GamePlatforms;
  languages: GameLanguageSupport;
  ageRating?: GameAgeRating;
  onlineFeatures: string[];
  /** Enum с сервера приходит числом (0 None, 1 Partial, 2 Full); строки — от старых записей/админки. */
  controllerSupport: number | "None" | "Partial" | "Full";
  cloudSavesSupported: boolean;
  basePrice: number;
  discountPercent?: number;
  currency: string;
  finalPrice: number;
  isActive: boolean;
  /** Черновик: карточка не показывается в каталоге и недоступна по прямой ссылке. */
  isDraft?: boolean;
  isNew: boolean;
  isTopRated: boolean;
  showInFeaturedStorefront: boolean;
  featuredStorefrontPriority: number;
  /** Enum с сервера приходит числом: 0 Steam, 1 Epic, 2 EA App, 3 Uplay, 4 Other. */
  keyType: number | string;
  keyFeatures: string[];
  keyFeaturesI18n?: Record<string, string[]> | null;
  awards: AwardBadge[];
  editions: Edition[];
  /** Где активируется ключ ПО. У игр нет — там площадка задаётся типом ключа. */
  activation?: SoftwareActivation | null;
  dlcItems: DLC[];
  systemRequirements: GameSystemRequirements;
  similarGameIds: string[];
  autoRecommendRules: GameAutoRecommendRules;
  ratingAvg: number;
  reviewsCount: number;
}

export interface GameCover {
  url: string;
  alt?: string;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbUrl: string;
  posterUrl?: string;
  durationSec?: number;
  title?: string;
  caption?: string;
  captionI18n?: Record<string, string> | null;
  isTrailer?: boolean;
  width?: number;
  height?: number;
  order?: number;
}

export interface Pricing {
  price: number;
  oldPrice?: number;
  currency: string;
  discountPercent?: number;
  /** До какого момента действует скидка (ISO) — из GameDiscount, той же, что применит чекаут. */
  discountEndsAt?: string | null;
}

/** Наличие ключей: статус без точного числа — покупателю нужен статус, а не объёмы склада. */
export type AvailabilityStatus = "inStock" | "lowStock" | "outOfStock" | "comingSoon";

export interface GameAvailability {
  status: AvailabilityStatus;
}

export interface Edition {
  code: string;
  title: string;
  titleI18n?: Record<string, string> | null;
  description: string;
  descriptionI18n?: Record<string, string> | null;
  price: number;
  /** Ручные цены издания по валютам (админка). На витрине не используются — цена приходит в editionPricing. */
  prices?: Record<string, number> | null;
  discountPercent?: number;
  includedItems?: string[];
  isDefault?: boolean;
  /** Лицензия ПО: срок в месяцах (нет — бессрочная), число устройств, подписка. У игровых изданий пусто. */
  licenseTermMonths?: number | null;
  licenseDevices?: number | null;
  isSubscription?: boolean;
  /**
   * Подпись лицензии с сервера («Subscription · 1 month · 5 devices»). Источник один на карточку каталога,
   * страницу, корзину, кабинет и письмо — раньше страница считала её сама и для подписок писала иначе.
   */
  label?: string | null;
}

export interface SoftwareActivation {
  target: 'VendorWebsite' | 'MicrosoftAccount' | 'InApp' | number;
  url?: string | null;
  label?: string | null;
  labelI18n?: Record<string, string> | null;
}

export interface DLC {
  id: string;
  title: string;
  coverUrl: string;
  price: number;
  discountPercent?: number;
  isBundle?: boolean;
}

export interface Review {
  id: string;
  userName: string;
  avatarUrl?: string;
  verifiedPurchase: boolean;
  rating: number;
  playtimeHours?: number;
  text: string;
  createdAt: string;
  /** Автор сам правил отзыв — витрина пишет «Edited …». Модерация сюда не попадает. */
  editedAt?: string | null;
  helpfulCount: number;
  images?: { url: string; thumbUrl: string }[];
  /** Сервер считает из звёзд (4–5 — true, 1–2 — false, 3 — null); витрина это поле не показывает. */
  recommend?: boolean | null;
  /** Покупку вернули. Отзыв остаётся и считается, рядом со звёздами стоит тихая пометка «Refunded». */
  refunded?: boolean;
  /** Ответ магазина под отзывом — оставляет модератор в админке. */
}

export interface GameCardItem {
  id: string;
  slug: string;
  title: string;
  coverUrl: string;
  /** Трейлер для превью при наведении; нет — видео у товара нет. */
  trailerUrl?: string | null;
  trailerPosterUrl?: string | null;
  /** Цена в валюте покупателя со скидкой; null — в этой валюте не продаётся. */
  pricing?: Pricing | null;
  /** Средняя оценка; null — отзывов нет. */
  rating?: number | null;
  reviewCount?: number;
  /** Вид товара — ссылка ведёт в нужный раздел. */
  kind?: 'Game' | 'Software';
}

export interface RatingBreakdownItem {
  rating: number;
  percent: number;
}

export interface ReviewTag {
  id: string;
  label: string;
}

export interface DetailRow {
  id: string;
  label: string;
  value: string | string[];
}

export interface GamePlatforms {
  windows: boolean;
  mac: boolean;
  linux: boolean;
  /** Консольные ключи (PSN/Xbox-стор); у старых записей поля нет — трактуется как false. */
  playStation?: boolean;
  xbox?: boolean;
  /** Мобильные системы — для ПО. */
  android?: boolean;
  ios?: boolean;
}

export interface GameLanguageSupport {
  audio: string[];
  text: string[];
}

export interface GameAgeRating {
  system: string;
  label: string;
  labelI18n?: Record<string, string> | null;
  iconUrl?: string;
}

export interface GameStudioInfo {
  name: string;
  website?: string;
  logoUrl?: string;
}

export interface AwardBadge {
  title: string;
  titleI18n?: Record<string, string> | null;
  year?: number;
  type?: string;
  iconUrl?: string;
}

export interface GameSystemRequirements {
  /**
   * Все три системы необязательны и равноправны. Отсутствие блока означает «не
   * поддерживается»: игра может продаваться только под macOS, Linux или быть консольной.
   * Пустой блок означал бы обратное — «поддерживается, но требования не указаны».
   */
  windows?: GameSystemRequirementBlock;
  mac?: GameSystemRequirementBlock;
  linux?: GameSystemRequirementBlock;
}

export interface GameSystemRequirementBlock {
  minimum: GameSystemRequirementSpec;
  recommended?: GameSystemRequirementSpec;
}

export interface GameSystemRequirementSpec {
  os?: string;
  cpu?: string;
  ram?: string;
  gpu?: string;
  storage?: string;
  notes?: string;
  notesI18n?: Record<string, string> | null;
}

export interface GameAutoRecommendRules {
  enabled: boolean;
  byGenres: boolean;
  byTags: boolean;
  byPublisher: boolean;
}

export interface RatingSummaryResponse {
  avg: number;
  count: number;
  distribution: Record<string, number>;
  /** Доля рекомендующих, %; null — отзывов нет. */
  recommendPercent?: number | null;
}

export interface GameRecommendationsResponse {
  /** Карточки полки — те же, что на главной и в каталоге (см. models/game.ts). */
  moreLikeThis: import('../models/game').Game[];
  recentlyViewed?: GameCardItem[];
}

/** DLC как товар каталога. */
export interface DlcProduct {
  id: string;
  slug: string;
  title: string;
  coverUrl?: string;
  isComingSoon?: boolean;
  pricing: Pricing | null;
}

export interface ParentGameRef {
  id: string;
  slug: string;
  title: string;
  coverUrl?: string;
}

export interface RegionInfo {
  mode: "Global" | "Regions" | string;
  regions: string[];
  regionNames: string[];
  excludedCountries: string[];
  buyerCountry?: string | null;
  allowed?: boolean | null;
  /** Английская сводка сервера — запас; текст на языке сайта собирает utils/region-text. */
  summary: string;
  exclusions?: string | null;
  /** Вид сводки кодом: worldwide / regions / locked / varies. Нет — старый ответ, показываем summary. */
  kind?: RegionKind | null;
}

export type RegionKind = "worldwide" | "regions" | "locked" | "varies";

export interface GameUserContext {
  isWishlisted: boolean;
  hasPurchased: boolean;
  myReview?: Review;
}

export interface GameDetailsResponse {
  game: GameDetails;
  /** Подписи жанров и тегов на языке сайта, по позициям game.genres / game.tags. */
  genreLabels?: string[];
  tagLabels?: string[];
  /** Игра или ПО: от вида зависят раздел, блоки страницы и выбор лицензии. */
  kind?: 'Game' | 'Software';
  /** Категория раздела /software (tag). */
  softwareCategory?: string | null;
  /** Статус релиза считает сервер по Game.ReleaseDate — клиент даты не сравнивает. */
  isComingSoon?: boolean;
  /** null — в запрошенной валюте игру не продаём: цены нет ни в прайс-листе, ни по курсу. */
  pricing: Pricing | null;
  /** Цены изданий в запрошенной валюте по коду издания; null — издание в ней не продаётся. */
  editionPricing?: Record<string, Pricing | null>;
  availability?: GameAvailability;
  /** Наличие по изданиям (код → статус), только когда изданий больше одного. */
  editionAvailability?: Record<string, GameAvailability>;
  /** DLC этой игры — отдельные товары каталога (своя страница, цена, ключи). */
  dlc?: DlcProduct[];
  /** Для страницы DLC — базовая игра, без которой DLC не активируется. */
  parentGame?: ParentGameRef | null;
  /** Регион активации: где ключ работает и подходит ли стране покупателя (null — страна неизвестна). */
  regionInfo?: RegionInfo;
  /**
   * Варианты ключа с ценами: «Global за 69.99», «Europe за 52.99». Приходят, только когда
   * вариантов больше одного, — выбирать из единственного нечего.
   */
  regionOffers?: RegionOffer[] | null;
  ratingSummary: RatingSummaryResponse;
  recommendations: GameRecommendationsResponse;
  userContext: GameUserContext;
}


/** Продаваемый вариант ключа: область активации, цена и наличие. */
export interface RegionOffer {
  offerKey: string;
  /** Английское название варианта («Global», «Europe») — хранится в корзине, переводится при показе. */
  title: string;
  summary: string;
  exclusions?: string | null;
  kind?: RegionKind | null;
  regionNames?: string[] | null;
  excludedCountries?: string[] | null;
  /** true/false — подходит ли стране покупателя, null — страна неизвестна. */
  allowed?: boolean | null;
  available: number;
  price: number;
  currency: string;
}

export interface AdminGameDiscount {
  gameId: string;
  discountPercent?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
}
