import i18n from '../i18n';
import { slugify } from './slugify';

/**
 * Игры и ПО живут в одном каталоге /games. Софт — не отдельный раздел, а режим того же каталога
 * (`/games?type=software`), вход в который — неброская плашка внизу выдачи игр: магазин в первую очередь
 * про игры. Здесь — всё, что витрине нужно знать о виде товара и лицензиях ПО: адреса, подписи сроков,
 * устройств и активации.
 */

export type SoftwareActivationTarget = 'VendorWebsite' | 'MicrosoftAccount' | 'InApp';

export const isSoftware = (kind?: string | null) => kind === 'Software';

/** Параметр адреса «тип товара» в каталоге: нет — всё, `software` — только софт, `games` — только игры. */
export const SOFTWARE_TYPE_PARAM = 'type';
export const SOFTWARE_TYPE_VALUE = 'software';
export const GAMES_TYPE_VALUE = 'games';

/** Каталог только с играми — для ссылок, которые обещают именно игры («All games», «Budget picks»). */
export const gamesCatalogPath = (extra?: Record<string, string>) => {
  const params = new URLSearchParams({ [SOFTWARE_TYPE_PARAM]: GAMES_TYPE_VALUE });
  Object.entries(extra ?? {}).forEach(([key, value]) => params.set(key, value));
  return `/games?${params.toString()}`;
};
/** Параметр адреса с категорией софта (tag из настроек: security, office…). */
export const SOFTWARE_CATEGORY_PARAM = 'softwareCategory';

/**
 * Каталог софта, при желании — сразу в категории и с дополнительными фильтрами (`onSale=1` и т.п.).
 * Единственное место, где собирается этот адрес: шапка, футер, страница товара и редиректы со старых
 * адресов /software/… берут его отсюда.
 */
export const softwareCatalogPath = (category?: string | null, extra?: Record<string, string>) => {
  const params = new URLSearchParams({ [SOFTWARE_TYPE_PARAM]: SOFTWARE_TYPE_VALUE });
  if (category) params.set(SOFTWARE_CATEGORY_PARAM, category);
  Object.entries(extra ?? {}).forEach(([key, value]) => params.set(key, value));
  return `/games?${params.toString()}`;
};


/**
 * Каталог игр или софта с фильтрами: `catalogHref(true, { tag: 'vpn' })` → `/games?type=software&tag=vpn`.
 * Склеивать `${section}?tag=…` руками нельзя: у софта в адресе уже есть `?type=software`.
 */
export const catalogHref = (software: boolean, params: Record<string, string> = {}) => {
  if (software) return softwareCatalogPath(undefined, params);
  const query = new URLSearchParams(params).toString();
  return query ? `/games?${query}` : '/games';
};

/** Адрес товара — у игр и софта один корень /games/{slug}; старые /software/{slug} перенаправляются сюда. */
export const productHref = (item: { kind?: string | null; slug?: string | null; title?: string | null; name?: string | null }) =>
  `/games/${item.slug ? slugify(item.slug) : slugify(item.title || item.name || '')}`;

/** Подпись срока по значению фильтра: «12» → «1 year», «lifetime» → «Lifetime». */
export const termLabel = (key: string) => {
  if (key === 'lifetime') return i18n.t('software.lifetime');
  const months = Number(key);
  if (!Number.isFinite(months) || months <= 0) return key;
  return monthsLabel(months);
};

export const monthsLabel = (months: number) => {
  if (months % 12 === 0) return i18n.t('software.years', { count: months / 12 });
  return i18n.t('software.months', { count: months });
};

/**
 * Подпись срока лицензии — то же правило, что у сервера (SoftwareCatalog.TermLabel): «1 year», «Lifetime»,
 * у подписки — «Subscription · 1 year» или просто «Subscription» без срока.
 */
export const licenseTermLabel = (months?: number | null, subscription?: boolean) => {
  const term = months && months > 0 ? monthsLabel(months) : subscription ? null : i18n.t('software.lifetime');
  return subscription ? (term ? i18n.t('software.subscriptionTerm', { term }) : i18n.t('software.subscription')) : term ?? '';
};

/**
 * Подпись лицензии по её полям: «1 year · 3 devices», «Subscription · 1 month». Без срока, устройств и
 * подписки — готовая строка сервера (название издания), если она есть.
 */
export const licenseText = (
  license?: { termMonths?: number | null; devices?: number | null; isSubscription?: boolean | null; label?: string | null } | null,
) => {
  if (!license) return '';
  const { termMonths, devices, isSubscription } = license;
  if (termMonths == null && devices == null && !isSubscription) return license.label ?? '';
  const parts = [licenseTermLabel(termMonths, Boolean(isSubscription))];
  if (devices && devices > 0) parts.push(devicesLabel(devices));
  return parts.filter(Boolean).join(' · ');
};

export const devicesLabel = (key: string | number) => {
  const text = String(key);
  if (text.endsWith('+')) return i18n.t('software.devicesPlus', { value: text.slice(0, -1) });
  const count = Number(text);
  return Number.isFinite(count) ? i18n.t('software.devices', { count }) : text;
};

export const ACTIVATION_LABELS: Record<SoftwareActivationTarget, string> = {
  VendorWebsite: 'Vendor website',
  MicrosoftAccount: 'Microsoft account',
  InApp: 'In the app',
};

const TARGET_BY_NUMBER: SoftwareActivationTarget[] = ['VendorWebsite', 'MicrosoftAccount', 'InApp'];

/** В карточке товара перечисление приходит числом, в каталоге — строкой: приводим к строке. */
export const normalizeActivationTarget = (target?: string | number | null): SoftwareActivationTarget =>
  typeof target === 'number'
    ? TARGET_BY_NUMBER[target] ?? 'VendorWebsite'
    : target && target in ACTIVATION_LABELS
      ? (target as SoftwareActivationTarget)
      : 'VendorWebsite';

export const activationLabel = (target?: string | number | null) => i18n.t(`software.activation.${normalizeActivationTarget(target)}`);

/**
 * Где активировать — одной фразой для карточки покупки: своё имя из админки («Nova account»),
 * иначе хост ссылки, иначе по виду активации.
 */
export const activationPlace = (activation?: { target?: string | number | null; url?: string | null; label?: string | null } | null) => {
  if (activation?.label?.trim()) return activation.label.trim();
  if (activation?.url) {
    try {
      return new URL(activation.url).host.replace(/^www\./, '');
    } catch {
      // Неверная ссылка — подпись по виду активации.
    }
  }
  return activationLabel(activation?.target);
};

/** Короткие подписи систем для обложки карточки ПО. */
export const OS_SHORT: Record<string, string> = {
  Windows: 'WIN',
  macOS: 'MAC',
  Linux: 'LINUX',
  Android: 'AND',
  iOS: 'iOS',
};
