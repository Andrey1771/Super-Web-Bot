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
