// Единственный форматтер денег на весь фронт.
//
// До этого цены рисовались тремя разными способами: `$${x.toFixed(2)}` по двум десяткам
// компонентов, Intl с жёстко зашитым RUB в админке (при том что списание идёт в валюте
// расчёта сервера) и конвертация по выдуманным курсам в site-preferences. Результат —
// один и тот же товар выглядел по-разному на витрине, в корзине и в админке.
//
// Здесь нет никакой конвертации: функция форматирует сумму В ТОЙ валюте, в которой её дали.
// Пересчёт между валютами появится вместе с курсами и прайс-листами и будет жить на сервере.

/**
 * Валюты без дробной части. Список синхронизирован с серверным CurrencyMinorUnits —
 * менять только вместе с ним.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
    "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
    "XTR",
]);

/** Валюты с тремя знаками после запятой. */
const THREE_DECIMAL_CURRENCIES = new Set([
    "BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND",
]);

/** Запасной вариант, если валюта не пришла: показываем хоть что-то осмысленное. */
export const FALLBACK_CURRENCY = "USD";

/** Знаков после запятой у валюты. Неизвестная валюта считается двузначной. */
export function currencyFractionDigits(currency?: string | null): number {
    const code = (currency ?? "").trim().toUpperCase();
    if (!code) return 2;
    if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
    return THREE_DECIMAL_CURRENCIES.has(code) ? 3 : 2;
}

/**
 * Форматирует сумму в указанной валюте.
 *
 * Локаль зафиксирована на en-US намеренно: локаль ОС пользователя давала "$32,00" —
 * символ из одного мира, разделитель из другого. Весь сайт пишет цены одинаково.
 */
export interface FormatMoneyOptions {
    /**
     * Убрать нулевую дробную часть: «$20» вместо «$20.00».
     * Только для витринных подписей вроде полки «Under $20» — суммы товара, корзины
     * и заказа всегда показываем с полной точностью.
     */
    compact?: boolean;
}

export function formatMoney(
    amount: number | null | undefined,
    currency?: string | null,
    options?: FormatMoneyOptions,
): string {
    const code = (currency ?? "").trim().toUpperCase() || FALLBACK_CURRENCY;
    const value = Number(amount);
    const safeValue = Number.isFinite(value) ? value : 0;
    const naturalDigits = currencyFractionDigits(code);
    const digits = options?.compact && Number.isInteger(safeValue) ? 0 : naturalDigits;

    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: code,
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(safeValue);
    } catch {
        // Intl бросает RangeError на невалидном коде валюты (например, из битых данных заказа).
        // Цена важнее красоты: показываем сумму с кодом, а не роняем всю страницу.
        return `${safeValue.toFixed(digits)} ${code}`;
    }
}

/**
 * Сумма заказа: валюта берётся из самого заказа, а не из настроек пользователя.
 * Заказ оплачен в конкретной валюте, и в истории покупок она не должна «переезжать»
 * следом за переключателем в шапке.
 */
export function formatOrderMoney(amount: number | null | undefined, orderCurrency?: string | null): string {
    return formatMoney(amount, orderCurrency);
}
