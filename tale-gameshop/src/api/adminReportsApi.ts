import { apiClient } from "./client";

export interface PeriodReport {
  fromUtc: string;
  toUtc: string;
  baseCurrency: string;
  revenue: { amount: number; orders: number; unitsSold: number };
  refunds: {
    amount: number;
    orders: number;
    /** Возвраты без записанной суммы — только старые частичные. В деньги не входят. */
    withoutAmount: number;
  };
  cost: {
    amount: number;
    keysSold: number;
    keysWithCost: number;
    /** Продано ключей без закупочной цены — на эту величину расход занижен. */
    keysWithoutCost: number;
  };
  grossProfit: number;
  /** false — часть расходов не учтена, прибыль завышена. Показывать с оговоркой. */
  grossProfitComplete: boolean;
}

/** Границы — UTC ISO. Конец периода не включается. */
export const getPeriodReport = async (fromUtc: string, toUtc: string): Promise<PeriodReport> =>
  (
    await apiClient().get("/api/admin/reports/period", {
      params: { from: fromUtc, to: toUtc },
    })
  ).data;

export interface GameSalesRow {
  gameId: string;
  title: string;
  /** false — игра продавалась, но с тех пор удалена из каталога. */
  inCatalog: boolean;
  unitsSold: number;
  revenue: number;
  refundedUnits: number;
  refunded: number;
  cost: number;
  keysIssued: number;
  keysWithoutCost: number;
  grossProfit: number;
  /** null — выручки нет, делить не на что. */
  marginPercent: number | null;
  /** false — себестоимость неполная, маржа завышена. */
  costComplete: boolean;
}

export interface UnsoldGame {
  gameId: string;
  title: string;
  keysAvailable: number;
}

export interface GameSalesReport {
  fromUtc: string;
  toUtc: string;
  baseCurrency: string;
  rows: GameSalesRow[];
  /** Игры с ключами в пуле, у которых за период ни одной продажи. */
  unsold: UnsoldGame[];
  totals: {
    revenue: number;
    refunded: number;
    cost: number;
    grossProfit: number;
    unitsSold: number;
    keysIssued: number;
    keysWithoutCost: number;
    rowsWithUnknownCost: number;
    gamesSold: number;
    gamesUnsold: number;
  };
}

export const getGameSalesReport = async (fromUtc: string, toUtc: string): Promise<GameSalesReport> =>
  (
    await apiClient().get("/api/admin/reports/games", {
      params: { from: fromUtc, to: toUtc },
    })
  ).data;

export interface InventoryRow {
  gameId: string;
  title: string;
  inCatalog: boolean;
  keysAvailable: number;
  /** Сумма закупки лежащих ключей в базовой валюте. */
  value: number;
  keysWithoutCost: number;
  oldestAcquiredUtc: string | null;
  /** Сколько дней лежит самая старая партия. null — дата закупки неизвестна. */
  daysOnShelf: number | null;
  valueComplete: boolean;
}

export interface InventoryAgeBucket {
  label: string;
  maxDays: number | null;
  unknown: boolean;
  keys: number;
  value: number;
}

export interface InventoryValueReport {
  generatedAtUtc: string;
  baseCurrency: string;
  rows: InventoryRow[];
  aging: InventoryAgeBucket[];
  totals: {
    keysAvailable: number;
    value: number;
    keysWithoutCost: number;
    games: number;
    writtenOffKeys: number;
    writtenOffValue: number;
    valueComplete: boolean;
  };
}

/** Снимок на сейчас: периода у склада нет. */
export const getInventoryValueReport = async (): Promise<InventoryValueReport> =>
  (await apiClient().get("/api/admin/reports/inventory")).data;

export interface FunnelStep {
  key: string;
  label: string;
  /** Сколько РАЗНЫХ людей дошло до шага. */
  visitors: number;
  /** null у последнего шага: покупателей считают по заказам, делить не на что. */
  shareOfTopPercent: number | null;
  shareOfPreviousPercent: number | null;
  lostFromPrevious: number;
}

export interface FunnelReport {
  fromUtc: string;
  toUtc: string;
  steps: FunnelStep[];
  /** false — последний шаг считается по заказам, а не по посетителям. */
  buyersLinkedToVisitors: boolean;
}

export const getFunnelReport = async (fromUtc: string, toUtc: string): Promise<FunnelReport> =>
  (await apiClient().get("/api/admin/reports/funnel", { params: { from: fromUtc, to: toUtc } })).data;

export interface ChannelRow {
  source: string;
  orders: number;
  unitsSold: number;
  revenue: number;
  cost: number;
  keysIssued: number;
  keysWithoutCost: number;
  ordersWithoutKeys: number;
  campaigns: string[];
  grossProfit: number;
  marginPercent: number | null;
  averageOrder: number | null;
  /** false — расход неполный, маржа завышена. */
  costComplete: boolean;
  /** Потрачено на привлечение. null — трат не заносили, окупаемость неизвестна. */
  spend: number | null;
  /** Прибыль после рекламы. null, если траты не занесены. */
  netProfit: number | null;
  /** Сколько маржи на каждую единицу рекламных денег. */
  roas: number | null;
}

export interface ChannelReport {
  baseCurrency: string;
  rows: ChannelRow[];
  repeat: { buyersInPeriod: number; repeatBuyers: number; repeatSharePercent: number | null };
  totals: {
    revenue: number;
    cost: number;
    grossProfit: number;
    orders: number;
    ordersWithoutKeys: number;
    keysWithoutCost: number;
    unattributedOrders: number;
    /** Сумма занесённых трат за период. */
    spend: number;
    /** По скольким источникам траты вообще заносили. */
    sourcesWithSpend: number;
  };
}

export const getChannelReport = async (fromUtc: string, toUtc: string): Promise<ChannelReport> =>
  (await apiClient().get("/api/admin/reports/channels", { params: { from: fromUtc, to: toUtc } })).data;

export interface AbandonedCartRow {
  userId: string | null;
  /** Есть ли куда написать: у гостя идентификатор анонимный. */
  contactable: boolean;
  items: number;
  value: number;
  updatedAtUtc: string;
  idleHours: number;
  /** Когда по этой корзине уже писали. null — не писали. */
  remindedAtUtc: string | null;
}

export interface AbandonedCartsReport {
  generatedAtUtc: string;
  baseCurrency: string;
  idleHours: number;
  rows: AbandonedCartRow[];
  totals: {
    carts: number;
    items: number;
    value: number;
    contactable: number;
    cartsWithoutTimestamp: number;
    reminded: number;
  };
}

export const getAbandonedCarts = async (idleHours: number): Promise<AbandonedCartsReport> =>
  (await apiClient().get("/api/admin/reports/abandoned-carts", { params: { idleHours } })).data;

/** Результат отправки по одной корзине: sent · already_reminded · unsubscribed · no_address · cart_empty · failed. */
export interface ReminderResult {
  userId: string;
  status: string;
  sentAtUtc: string | null;
}

/**
 * Отправить напоминания по выбранным корзинам. Вызывается только по явному нажатию:
 * автоматической рассылки в магазине нет.
 */
export const remindAbandonedCarts = async (userIds: string[]): Promise<ReminderResult[]> =>
  (await apiClient().post("/api/admin/reports/abandoned-carts/remind", { userIds })).data;

/**
 * Траты на привлечение. Заносит их человек: рекламные кабинеты живут отдельно, и
 * автоматически взять сумму неоткуда.
 */
export interface ChannelSpend {
  id: string;
  source: string;
  spentOnUtc: string;
  amount: number;
  currency: string;
  note: string | null;
}

export const getChannelSpend = async (fromUtc: string, toUtc: string): Promise<ChannelSpend[]> =>
  (await apiClient().get("/api/admin/reports/channel-spend", { params: { from: fromUtc, to: toUtc } })).data;

export const addChannelSpend = async (input: {
  source: string;
  spentOn: string;
  amount: number;
  currency?: string;
  note?: string;
}): Promise<ChannelSpend> =>
  (await apiClient().post("/api/admin/reports/channel-spend", input)).data;

export const deleteChannelSpend = async (id: string): Promise<void> => {
  await apiClient().delete(`/api/admin/reports/channel-spend/${id}`);
};
