import i18n from '../../i18n';

// Единый список категорий обращений: используется и формой на /support,
// и модалкой «New request» в кабинете. Держим один словарь, чтобы поддержка
// могла фильтровать тикеты по категориям без дублей-синонимов.
//
// На сервер уходит английское значение (value): по нему поддержка фильтрует обращения
// независимо от языка покупателя. Покупателю показывается подпись из словаря (help.categories.<key>).
export const SUPPORT_CATEGORIES = [
    { key: 'orderStatus', value: 'Order status' },
    { key: 'payment', value: 'Payment & checkout' },
    { key: 'delivery', value: 'Key delivery / activation' },
    { key: 'refund', value: 'Refund request' },
    { key: 'product', value: 'Game / product question' },
    { key: 'account', value: 'Account & security' },
    { key: 'technical', value: 'Technical issue / bug' },
    { key: 'other', value: 'Other' }
] as const;

/** Значения категорий, как их знает сервер. */
export const supportCategories: string[] = SUPPORT_CATEGORIES.map((category) => category.value);

/** Подпись категории на языке сайта; незнакомое значение (старое обращение) — как есть. */
export const supportCategoryLabel = (value: string): string => {
    const found = SUPPORT_CATEGORIES.find((category) => category.value === value);
    return found ? i18n.t(`help.categories.${found.key}`) : value;
};
