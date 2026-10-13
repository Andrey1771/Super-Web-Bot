import i18n from './index';

/** Локаль Intl для текущего языка сайта: даты, числа и списки говорят на том же языке, что и интерфейс. */
export const currentLocale = (): string => {
  switch (i18n.language) {
    case 'ru':
      return 'ru-RU';
    case 'uk':
      return 'uk-UA';
    case 'pl':
      return 'pl-PL';
    default:
      return 'en-US';
  }
};

/** Дата в языке сайта: «13 сент. 2026 г.», «Sep 13, 2026». Битое значение возвращается как есть. */
export const formatDate = (value?: string | number | Date | null, options?: Intl.DateTimeFormatOptions): string => {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(currentLocale(), options ?? { year: 'numeric', month: 'short', day: 'numeric' });
};

/** Дата со временем — для журналов и подсказок. */
export const formatDateTime = (value?: string | number | Date | null): string =>
  formatDate(value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Дата со временем или прочерк — для таблиц админки, где пустое значение должно быть видно. */
export const formatDateTimeOrDash = (value?: string | number | Date | null): string => formatDateTime(value) || '—';

/** Число в языке сайта: разделители тысяч и дробей по правилам локали. */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(currentLocale(), options).format(value);
