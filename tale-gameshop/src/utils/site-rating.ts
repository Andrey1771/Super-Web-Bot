import { formatNumber } from '../i18n/format';
import type { SiteReviewSummary } from "../api/reviewsApi";

/**
 * Сколько отзывов нужно, чтобы вообще показывать среднюю оценку.
 *
 * На малых числах среднее говорит не о магазине, а о случайности: два отзыва «5» дают
 * гордые 5.0/5, один недовольный обваливает картину до 3.0. Показывать такое как
 * «рейтинг» — вводить человека в заблуждение, даже если каждое число настоящее.
 * Порог взят по нижней границе того, что делают площадки отзывов (обычно 10–20).
 */
export const MIN_REVIEWS_FOR_RATING = 20;

export type RatingRow = {
  stars: number;
  /** Сколько отзывов с такой оценкой. */
  count: number;
  /** Доля в процентах, уже округлённая для подписи. Сумма по всем строкам — ровно 100. */
  percent: number;
  /** Неокруглённая доля: ширина полосы, чтобы округление не искажало картинку. */
  exactPercent: number;
};

export type SiteRatingView =
  /** Отзывов нет совсем — молодой магазин, а не ошибка. */
  | { state: "empty" }
  /** Отзывы есть, но их слишком мало, чтобы среднее что-то значило. */
  | { state: "too-few"; count: number }
  | { state: "ready"; average: number; count: number; starsPercent: number; rows: RatingRow[] };

/**
 * Проценты, сумма которых ровно 100 — метод наибольшего остатка.
 *
 * Простое округление каждой доли даёт столбик вроде 72/19/6/2/1 = 100 в одном наборе
 * данных и 101 в другом. Пять чисел на экране складываются глазом, и «101%» читается
 * как ошибка в расчётах, хотя ошибка только в округлении.
 */
const distributePercents = (counts: number[]): number[] => {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return counts.map(() => 0);
  }

  const exact = counts.map((value) => (value / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);

  // Остаток раздаём тем позициям, у которых отброшенная часть была больше.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (const item of order) {
    if (remainder <= 0) {
      break;
    }
    result[item.index] += 1;
    remainder -= 1;
  }
  return result;
};

/**
 * Переводит сводку с сервера в то, что рисует карточка рейтинга.
 *
 * Отдельная функция, а не расчёт внутри компонента: здесь три состояния и арифметика
 * округления, которые надо проверять тестами, а не глазами на живой странице.
 */
export const buildSiteRatingView = (summary: SiteReviewSummary): SiteRatingView => {
  const count = Math.max(0, Math.trunc(summary.count));
  if (count === 0) {
    return { state: "empty" };
  }
  if (count < MIN_REVIEWS_FOR_RATING) {
    return { state: "too-few", count };
  }

  // Оценки без единого отзыва сервер в distribution не присылает — строку всё равно
  // показываем, с нулём: пустая строка «1★ — 0%» честнее, чем её отсутствие.
  const stars = [5, 4, 3, 2, 1];
  const counts = stars.map((value) => Math.max(0, Math.trunc(summary.distribution?.[String(value)] ?? 0)));
  const percents = distributePercents(counts);
  const totalInDistribution = counts.reduce((sum, value) => sum + value, 0);

  const rows: RatingRow[] = stars.map((value, index) => ({
    stars: value,
    count: counts[index],
    percent: percents[index],
    exactPercent: totalInDistribution === 0 ? 0 : (counts[index] / totalInDistribution) * 100,
  }));

  const average = Math.min(5, Math.max(0, summary.average));
  return {
    state: "ready",
    average,
    count,
    // Ширина заливки поверх пяти звёзд.
    starsPercent: (average / 5) * 100,
    rows,
  };
};

/** Средняя оценка в подписи: 4.1, а не 4.147540983606557. */
export const formatAverage = (average: number): string => average.toFixed(1);

/** Количество отзывов: 2 300, а не 2300 — длинные числа иначе не читаются. */
export const formatReviewCount = (count: number): string => formatNumber(count);
