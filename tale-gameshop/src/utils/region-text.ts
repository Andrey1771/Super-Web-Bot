import i18n from '../i18n';
import { currentLocale } from '../i18n/format';

/**
 * Подписи региона на языке покупателя.
 *
 * Сервер описывает область активации кодом вида (`kind`) и списками: названия регионов и коды
 * исключённых стран. Текст собираем здесь — одним правилом для карточки, страницы товара, корзины
 * и кассы, как и на сервере (RegionSummary). Английские `summary`/`exclusions`/`badge` сервер
 * по-прежнему присылает, и они остаются запасом для ответа без кода вида.
 */
export type RegionKind = 'worldwide' | 'regions' | 'locked' | 'varies';

export type RegionText = {
  kind?: RegionKind | string | null;
  regionNames?: string[] | null;
  excludedCountries?: string[] | null;
  summary?: string | null;
  exclusions?: string | null;
  badge?: string | null;
};

/**
 * Встроенный справочник регионов сервера (RegionCatalog.Default) — английские названия по коду.
 * Переводим только их: регион, который админ назвал по-своему, показываем как назван.
 */
const DEFAULT_REGION_NAMES: Record<string, string> = {
  EU: 'Europe',
  NA: 'North America',
  LATAM: 'Latin America',
  CIS: 'CIS',
  TR: 'Türkiye',
  MENA: 'Middle East & North Africa',
  ASIA: 'Asia',
  OCEANIA: 'Oceania',
  AFRICA: 'Africa',
};

const SERVER_GLOBAL = 'Global';
const SERVER_LOCKED = 'Region-locked';

/** Название региона на языке сайта; незнакомое (переименованное админом) — как есть. */
export const regionName = (name: string): string => {
  const code = Object.keys(DEFAULT_REGION_NAMES).find((key) => DEFAULT_REGION_NAMES[key] === name);
  return code ? i18n.t('region.names.' + code, { defaultValue: name }) : name;
};

const displayNames = new Map<string, Intl.DisplayNames | null>();

/** Название страны по коду ISO-3166 на языке сайта. Нет данных у браузера — запасное имя или код. */
export const countryName = (code: string, fallback?: string | null): string => {
  const locale = currentLocale();
  let names = displayNames.get(locale);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      names = null;
    }
    displayNames.set(locale, names);
  }
  try {
    return names?.of(code.toUpperCase()) ?? fallback ?? code;
  } catch {
    return fallback ?? code;
  }
};

const joinRegions = (names: string[]) => names.map(regionName).join(', ');
const joinCountries = (codes: string[]) => codes.map((code) => countryName(code)).join(', ');

/** «Activates worldwide», «Activates in Europe», «Region-locked» — на языке покупателя. */
export const regionSummaryText = (info: RegionText): string => {
  switch (info.kind) {
    case 'worldwide':
      return i18n.t('region.worldwide');
    case 'regions':
      return i18n.t('region.activatesIn', { regions: joinRegions(info.regionNames ?? []) });
    case 'locked':
      return i18n.t('region.locked');
    case 'varies':
      return i18n.t('region.varies');
    default:
      return info.summary ?? '';
  }
};

/** «Not in Russia, Belarus» или null, если исключений нет. */
export const regionExclusionsText = (info: RegionText): string | null => {
  const codes = info.excludedCountries;
  if (codes && codes.length > 0) {
    return i18n.t('region.except', { countries: joinCountries(codes) });
  }
  // Старый ответ без списка — остаётся английская строка сервера.
  return codes ? null : info.exclusions ?? null;
};

/** Короткий бейдж для карточки и корзины: «Global», «Europe», «Europe +1», «Varies by key». */
export const regionBadgeText = (info: RegionText): string => {
  const names = info.regionNames ?? [];
  switch (info.kind) {
    case 'worldwide':
      return i18n.t('region.global');
    case 'varies':
      return i18n.t('region.variesBadge');
    case 'regions':
      if (names.length === 1) return regionName(names[0]);
      if (names.length > 1) return i18n.t('region.badgeMore', { name: regionName(names[0]), count: names.length - 1 });
      return i18n.t('region.locked');
    case 'locked':
      return i18n.t('region.locked');
    default:
      return info.badge ?? '';
  }
};

/** Сводка и исключения одной строкой: «Activates in Europe · Not in Ukraine». */
export const regionLineText = (info: RegionText): string =>
  [regionSummaryText(info), regionExclusionsText(info)].filter(Boolean).join(' · ');

/**
 * Название варианта ключа («Global», «Europe, North America») по серверной строке.
 * Строка хранится в корзине как есть — переводим при показе, чтобы позиция, добавленная на одном
 * языке, читалась на другом.
 */
export const regionTitleText = (title: string): string =>
  title
    .split(', ')
    .map((part) => (part === SERVER_GLOBAL ? i18n.t('region.global') : part === SERVER_LOCKED ? i18n.t('region.locked') : regionName(part)))
    .join(', ');

/** Каталог стран с названиями на языке сайта, отсортированный по ним. */
export const localizeCountries = <T extends { code: string; name: string }>(list: T[]): T[] => {
  const locale = currentLocale();
  return list
    .map((option) => ({ ...option, name: countryName(option.code, option.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
};

/** Название варианта ключа на странице товара: по коду и списку регионов, иначе — серверная строка. */
export const regionOfferTitle = (offer: { title: string } & RegionText): string => {
  switch (offer.kind) {
    case 'worldwide':
      return i18n.t('region.global');
    case 'locked':
      return i18n.t('region.locked');
    case 'regions':
      return joinRegions(offer.regionNames ?? []) || regionTitleText(offer.title);
    default:
      return regionTitleText(offer.title);
  }
};
