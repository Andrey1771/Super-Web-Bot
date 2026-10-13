import i18n from '../i18n';
/**
 * Правила показа цифр на странице «О нас».
 *
 * Сервер отдаёт факты, витрина решает, стоит ли их показывать. Порог тут не про красоту:
 * маленькое число само по себе не врёт, но в блоке «масштаб» читается как заявка на масштаб,
 * которой ещё нет. Молодому магазину честнее показать три плитки из четырёх, чем «1 страна»
 * рядом со словами про глобальную доставку.
 *
 * Ни одно число не округляется вверх и не получает «+»: именно так в разметке появились
 * «5,000+ Games curated» при полусотне игр в каталоге.
 */

export type AboutStats = {
  foundedYear: number | null;
  gamesInCatalog: number;
  genresInCatalog: number;
  activationRegions: number;
  keysDelivered: number;
  countriesServed: number;
  supportMedianMinutes: number | null;
  supportSampleSize: number;
};

export const EMPTY_ABOUT_STATS: AboutStats = {
  foundedYear: null,
  gamesInCatalog: 0,
  genresInCatalog: 0,
  activationRegions: 0,
  keysDelivered: 0,
  countriesServed: 0,
  supportMedianMinutes: null,
  supportSampleSize: 0,
};

/** Каталог из пары игр — не витрина. */
export const MIN_GAMES = 10;

/**
 * Жанры и регионы активации — про возможности магазина, а не про его объём.
 *
 * Порог у них поэтому низкий: «12 жанров» не становится правдивее оттого, что магазин
 * старше, и не врёт оттого, что он молодой. В отличие от выданных ключей, это число
 * посетитель может пересчитать сам — в фильтрах каталога и в региональной политике ключа.
 */
export const MIN_GENRES = 4;
export const MIN_REGIONS = 2;

/** Ниже сотни счётчик выдач меняется от одного заказа и говорит только «мы вчера открылись». */
export const MIN_KEYS = 100;

/** Одна-две страны — это не «география», а совпадение. */
export const MIN_COUNTRIES = 3;

/** Медиана по трём обращениям — не показатель скорости, а случайность. */
export const MIN_SUPPORT_SAMPLE = 20;

export type StatTile = { value: string; label: string };

const nf = new Intl.NumberFormat("en-US");

/**
 * Время ответа человеческим языком. 47 минут — «47 min», 95 — «about 2 h»:
 * точность до минуты на часовых интервалах создаёт впечатление измерения, которого нет.
 */
export const formatResponseTime = (minutes: number): string => {
  if (minutes < 1) {
    return "under a minute";
  }
  if (minutes < 90) {
    return i18n.t('about.stats.min', { count: Math.round(minutes) });
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return i18n.t('about.stats.aboutHours', { count: Math.round(hours) });
  }
  const days = Math.round(hours / 24);
  return days === 1 ? i18n.t('about.stats.aboutDay') : i18n.t('about.stats.aboutDays', { count: days });
};

/**
 * Плитки масштаба. Порядок постоянный, а не «сначала те, что прошли порог»: иначе набор
 * плиток переставляется сам собой по мере роста магазина.
 */
export const buildStatTiles = (stats: AboutStats): StatTile[] => {
  const tiles: StatTile[] = [];

  if (stats.foundedYear) {
    tiles.push({ value: String(stats.foundedYear), label: i18n.t('about.stats.founded') });
  }
  if (stats.gamesInCatalog >= MIN_GAMES) {
    tiles.push({ value: nf.format(stats.gamesInCatalog), label: i18n.t('about.stats.games') });
  }
  if (stats.genresInCatalog >= MIN_GENRES) {
    tiles.push({ value: nf.format(stats.genresInCatalog), label: i18n.t('about.stats.genres') });
  }
  if (stats.activationRegions >= MIN_REGIONS) {
    tiles.push({ value: nf.format(stats.activationRegions), label: i18n.t('about.stats.regions') });
  }
  if (stats.countriesServed >= MIN_COUNTRIES) {
    tiles.push({ value: nf.format(stats.countriesServed), label: i18n.t('about.stats.countries') });
  }
  if (stats.keysDelivered >= MIN_KEYS) {
    tiles.push({ value: nf.format(stats.keysDelivered), label: i18n.t('about.stats.keys') });
  }

  return tiles;
};

/** Строка «Response time» в карточке рейтинга. null — показывать нечего, строку прячем. */
export const buildResponseTime = (stats: AboutStats): string | null => {
  if (stats.supportMedianMinutes === null || stats.supportSampleSize < MIN_SUPPORT_SAMPLE) {
    return null;
  }
  return formatResponseTime(stats.supportMedianMinutes);
};
