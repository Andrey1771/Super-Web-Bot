import { currentLocale } from '../i18n/format';

// Дата релиза для покупательских глаз — в языке сайта, как и остальной текст витрины.
// null — если даты нет или она не парсится; вызывающий сам решает, что показать (обычно «TBA»).
export const formatReleaseDate = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? null
        : parsed.toLocaleDateString(currentLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * «Выйдет 28 окт. 2026 г.» / «Дата выхода пока не объявлена» — подпись невышедшей игры там, где вместо цены и корзины
 * (рекомендации). t — переводчик вызывающего компонента.
 */
export const releaseLabel = (t: (key: string, options?: Record<string, unknown>) => string, value?: string | null): string => {
    const date = formatReleaseDate(value);
    return date ? t('purchase.releases', { date }) : t('purchase.releaseTba');
};
