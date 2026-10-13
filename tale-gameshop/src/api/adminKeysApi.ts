import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IApiClient } from '../iterfaces/i-api-client';

const api = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;

export interface KeyInventory {
  gameId: string;
  available: number;
  assigned: number;
  /** Остаток по изданиям; пустой editionCode — ключи базового издания (без кода). */
  byEdition?: Array<{ editionCode: string; available: number }>;
  /** Остаток по политикам активации: партия «EU only» и партия под политику игры — разные запасы. */
  byRegion?: Array<{ summary: string; policy: RegionPolicyDto | null; editionCode: string; available: number }>;
  /** Политика активации игры по умолчанию; null — везде. */
  regionPolicy?: RegionPolicyDto | null;
}

export type RegionPolicyDto = { mode: 'Global' | 'Regions'; regions: string[]; excludedCountries: string[] };

export interface GrantResult {
  granted: boolean;
  key?: string;
  keyType?: string;
  message?: string;
}

export const getKeyInventory = async (gameId: string): Promise<KeyInventory> =>
  (await api().get(`/api/admin/keys/inventory/${gameId}`)).data;

/**
 * Себестоимость партии. Пустая цена — «неизвестна»: заливка не должна вставать из-за того,
 * что закупочную цену ещё не знают, поэтому поля необязательны.
 */
export interface KeyBatchCostInput {
  unitCost?: number | null;
  costCurrency?: string;
  supplier?: string;
}

/** Ненулевые поля себестоимости в тело запроса; пустая цена — не шлём ничего. */
const costBody = (cost?: KeyBatchCostInput) =>
  cost && cost.unitCost !== null && cost.unitCost !== undefined
    ? { unitCost: cost.unitCost, costCurrency: cost.costCurrency || undefined, supplier: cost.supplier || undefined }
    : {};

export const addKeysToInventory = async (
  gameId: string,
  keyType: string,
  keys: string[],
  editionCode?: string,
  regionPolicy?: RegionPolicyDto | null,
  cost?: KeyBatchCostInput,
  /** Цена ПРОДАЖИ ключей этого региона. Пусто — регион продаётся по цене игры. */
  salePrice?: number | null
): Promise<{ added: number; skippedDuplicates: number; previouslyVoided: number; available: number }> =>
  (await api().post(`/api/admin/keys/inventory/${gameId}`, {
    keyType,
    keys,
    editionCode: editionCode || undefined,
    regionPolicy: regionPolicy ?? undefined,
    salePrice: salePrice ?? undefined,
    ...costBody(cost),
  })).data;

/**
 * Цена продажи регионального варианта. Пустая цена снимает её — вариант снова продаётся
 * по цене игры.
 */
export const setRegionPrice = async (
  gameId: string,
  regionPolicy: RegionPolicyDto | null,
  price: number | null,
  editionCode?: string
): Promise<void> => {
  await api().put(`/api/admin/keys/inventory/${gameId}/region-price`, {
    regionPolicy: regionPolicy ?? undefined,
    editionCode: editionCode || undefined,
    price,
  });
};

/** Политика активации игры по умолчанию (для ключей без своей). null — везде. */
export const setGameRegionPolicy = async (gameId: string, policy: RegionPolicyDto | null): Promise<void> => {
  await api().put(`/api/admin/keys/inventory/${gameId}/region-policy`, policy);
};

export const grantKey = async (
  gameId: string,
  userId: string,
  keyType?: string
): Promise<GrantResult> =>
  (await api().post('/api/admin/keys/grant', { gameId, userId, keyType })).data;

export interface GameKeyListItem {
  id: string;
  key: string;
  masked: boolean;
  keyType: string;
  status: 'Pool' | 'Delivered' | 'Voided';
  ownerEmail?: string | null;
  issuedAt?: string | null;
  /** Кто залил ключ в пул; пусто у ключей, залитых до появления поля. */
  addedBy?: string | null;
  /** Кто выдал вручную; пусто — автоматическая выдача при оплате. */
  issuedBy?: string | null;
  /** Издание ключа; пусто — базовое. */
  editionCode?: string | null;
  /** Цена закупки ключа. Пусто — себестоимость неизвестна (не «бесплатно»). */
  unitCost?: number | null;
  costCurrency?: string | null;
  supplier?: string | null;
  /** Идентификатор заливки: у всех ключей одной партии одинаковый. */
  batchId?: string | null;
  /** Подпись политики активации партии; пусто — политика игры. */
  regionSummary?: string | null;
}

export interface GameKeyPage {
  items: GameKeyListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const listKeys = async (
  gameId: string,
  opts: { query?: string; status?: string; page?: number; pageSize?: number } = {}
): Promise<GameKeyPage> => {
  const params = new URLSearchParams();
  if (opts.query) params.set('query', opts.query);
  if (opts.status && opts.status !== 'all') params.set('status', opts.status);
  params.set('page', String(opts.page ?? 1));
  params.set('pageSize', String(opts.pageSize ?? 25));
  return (await api().get(`/api/admin/keys/inventory/${gameId}/list?${params.toString()}`)).data;
};

export interface KeyOverviewRow {
  gameId: string;
  title: string;
  available: number;
  delivered: number;
  voided: number;
  awaiting: number;
  outOfStock: boolean;
  low: boolean;
  /** Порог «мало» для этой строки: свой у игры или общий. */
  lowThreshold?: number;
}

/** Что показывать: по умолчанию только требующее внимания, остальное — по явному выбору. */
export type KeyStockStatus = 'attention' | 'awaiting' | 'out' | 'low' | 'ok' | 'all';

export interface KeyOverview {
  /** Итоги — по всему каталогу, а не по видимой странице. */
  totals: { games: number; available: number; delivered: number; awaiting: number; outOfStock: number; lowStock: number };
  lowThreshold: number;
  status: KeyStockStatus;
  query: string | null;
  page: number;
  pageSize: number;
  /** Сколько строк подходит под фильтр — по нему считаются страницы. */
  total: number;
  games: KeyOverviewRow[];
}

export const getKeyOverview = async (options?: {
  lowThreshold?: number;
  status?: KeyStockStatus;
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<KeyOverview> => {
  const params = new URLSearchParams();
  params.set('lowThreshold', String(options?.lowThreshold ?? 5));
  params.set('status', options?.status ?? 'attention');
  params.set('page', String(options?.page ?? 1));
  params.set('pageSize', String(options?.pageSize ?? 25));
  if (options?.query?.trim()) {
    params.set('query', options.query.trim());
  }
  return (await api().get(`/api/admin/keys/overview?${params.toString()}`)).data;
};

/** Строка склада по области активации: сколько ключей и какие игры ждут пополнения именно в ней. */
export interface KeyRegionRow {
  offerKey: string;
  title: string;
  summary: string;
  exclusions: string | null;
  available: number;
  delivered: number;
  gamesInStock: number;
  needRestock: Array<{ gameId: string; title: string; delivered: number }>;
  /**
   * Игры этой области: сначала те, что кончатся раньше. Список ограничен, полный размер — в
   * gamesTotal, а счётчик «скоро кончатся» считается по всем играм, а не по показанным.
   */
  games: Array<{
    gameId: string;
    title: string;
    available: number;
    delivered: number;
    soldInWindow: number;
    perDay: number | null;
    daysLeft: number | null;
    activeDays: number;
  }>;
  /** Срез ограничен: показана верхушка самых пустых, а не весь перечень игр области. */
  gamesTruncated: boolean;
  gamesRunningOutSoon: number;
  /** Выдачи по дням окна — длина совпадает с days из ответа. */
  daily: number[];
  soldInWindow: number;
  /** Средний расход в день; null — за окно не продано ничего, и считать нечего. */
  perDay: number | null;
  /** На сколько дней хватит остатка при текущем расходе; null — расхода не было. */
  daysLeft: number | null;
  /** За сколько дней считался темп: с первой продажи в окне. */
  activeDays: number;
}

/** Игра, у которой в этой области не осталось ключей: продать нечем прямо сейчас. */
export interface KeyOutOfStockRow {
  gameId: string;
  title: string;
  offerKey: string;
  regionTitle: string;
  available: number;
  /** Сколько уже выдано: спрос доказан, пополнять нужнее. */
  delivered: number;
  /** Цена за вариант назначена — витрина его показывает, а выдать нечего. */
  priced: boolean;
}

/** Игра в конкретной области активации: остаток, скорость продаж и кривая расхода по дням. */
export interface KeyGameSeries {
  gameId: string;
  title: string;
  offerKey: string;
  regionTitle: string;
  available: number;
  soldInWindow: number;
  perDay: number | null;
  daysLeft: number | null;
  /** За сколько дней считался темп: с первой продажи в окне, а не по всему окну. */
  activeDays: number;
  daily: number[];
}

export const getKeyRegionOverview = async (
  days = 30,
): Promise<{
  lowThreshold: number;
  soonDays: number;
  windowDays: number;
  days: string[];
  regions: KeyRegionRow[];
  games: KeyGameSeries[];
  gamesTotal: number;
  outOfKeys: KeyOutOfStockRow[];
  outOfKeysTotal: number;
  /** Отчёт посчитан по ограниченному срезу склада — на большом каталоге это верхушка. */
  truncated: boolean;
  /** Весь расход по дням: по нему график считает полосу «остальные игры». */
  totalDaily: number[];
}> =>
  (await api().get(`/api/admin/keys/overview/by-region?days=${days}`)).data;

export interface OwedLine {
  orderNumber: string;
  buyerEmail: string;
  gameId: string;
  gameTitle: string;
  remaining: number;
  createdAt: string;
}

export interface OwedList {
  total: number;
  lines: OwedLine[];
}

export const getOwedKeys = async (): Promise<OwedList> =>
  (await api().get('/api/admin/keys/owed')).data;

export const voidKey = async (gameId: string, keyId: string): Promise<void> => {
  await api().post(`/api/admin/keys/inventory/${gameId}/keys/${keyId}/void`);
};

export const purgeKey = async (gameId: string, keyId: string): Promise<void> => {
  await api().delete(`/api/admin/keys/inventory/${gameId}/keys/${keyId}`);
};

export const editKey = async (
  gameId: string,
  keyId: string,
  body: { key?: string; keyType?: string }
): Promise<void> => {
  await api().put(`/api/admin/keys/inventory/${gameId}/keys/${keyId}`, body);
};

/** Отчёт импорта: одинаковой формы для предпросмотра (dryRun) и реальной записи. */
export interface KeyImportReport {
  dryRun: boolean;
  lines: number;
  parsed: number;
  invalid: number;
  invalidSamples: string[];
  types?: Array<{ keyType: string; count: number }>;
  wouldAdd: number;
  duplicates: number;
  previouslyVoided: number;
  added: number;
  backfilledOrders: number;
}

/**
 * Импорт ключей из текста файла: по ключу в строке или CSV «key,type». dryRun=true — только
 * отчёт «добавится / дублей / невалидных», ничего не пишется.
 */
export const importKeys = async (
  gameId: string,
  content: string,
  keyType: string,
  dryRun: boolean,
  editionCode?: string,
  regionPolicy?: RegionPolicyDto | null,
  cost?: KeyBatchCostInput
): Promise<KeyImportReport> =>
  (await api().post(`/api/admin/keys/inventory/${gameId}/import`, { content, keyType, dryRun, editionCode: editionCode || undefined, regionPolicy: regionPolicy ?? undefined, ...costBody(cost) })).data;

/** Издания игры (для выбора при заливке ключей) — из карточки игры в админке. */
export const getGameEditions = async (gameId: string): Promise<Array<{ code: string; title: string; isDefault?: boolean }>> => {
  const { data } = await api().get(`/api/admin/games/${gameId}/details`);
  const editions = Array.isArray(data?.editions) ? data.editions : [];
  return editions.filter((e: any) => e?.code).map((e: any) => ({ code: e.code, title: e.title ?? e.code, isDefault: Boolean(e.isDefault) }));
};

/**
 * Порог «мало ключей» для игры; null — общий порог из настроек сайта. lowStockFromUtc — с этой даты
 * витрина показывает «Selling fast» при любом остатке (ручной ажиотаж); null — только по порогу.
 */
export const setLowStockThreshold = async (
  gameId: string,
  lowStockThreshold: number | null,
  lowStockFromUtc: string | null = null
): Promise<{ lowStockThreshold: number | null; lowStockFromUtc: string | null; defaultThreshold: number }> =>
  (await api().put(`/api/admin/keys/inventory/${gameId}/threshold`, { lowStockThreshold, lowStockFromUtc })).data;

/** Группа ключей без закупочной цены — то, что осталось проставить задним числом. */
export interface KeyCostGroup {
  gameId: string;
  title: string | null;
  /** false — игру удалили, а ключи остались. */
  inCatalog: boolean;
  batchId: string | null;
  uploadedOn: string;
  keyType: string;
  editionCode: string | null;
  keys: number;
  inPool: number;
  delivered: number;
  voided: number;
}

export const getKeyCostGroups = async (): Promise<{ totalKeys: number; groups: KeyCostGroup[] }> =>
  (await api().get('/api/admin/keys/cost-backfill')).data;

export interface KeyCostBackfillRequest {
  gameId: string;
  batchId?: string | null;
  uploadedOn?: string | null;
  keyType?: string;
  editionCode?: string | null;
  unitCost: number;
  costCurrency?: string;
  supplier?: string;
  /** Сколько ключей группы взять по порядку заведения. Пусто — все без цены. */
  limit?: number;
  dryRun: boolean;
}

export const backfillKeyCost = async (
  request: KeyCostBackfillRequest
): Promise<{ matched: number; updated: number; dryRun: boolean; unitCost: number; currency: string }> =>
  (await api().post('/api/admin/keys/cost-backfill', request)).data;
