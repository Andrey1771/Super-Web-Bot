// Дата релиза для покупательских глаз: en-US, как и цены (правило сайта, см. site-preferences).
// null — если даты нет или она не парсится; вызывающий сам решает, что показать (обычно «TBA»).
export const formatReleaseDate = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? null
        : parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
