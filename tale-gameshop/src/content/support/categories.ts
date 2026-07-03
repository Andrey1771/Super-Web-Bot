// Единый список категорий обращений: используется и формой на /support,
// и модалкой «New request» в кабинете. Держим один словарь, чтобы поддержка
// могла фильтровать тикеты по категориям без дублей-синонимов.
export const supportCategories = [
    'Order status',
    'Payment & checkout',
    'Key delivery / activation',
    'Refund request',
    'Game / product question',
    'Account & security',
    'Technical issue / bug',
    'Other'
];
