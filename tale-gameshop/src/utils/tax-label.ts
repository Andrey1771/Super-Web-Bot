import i18n from '../i18n';
/**
 * Подпись налога из ответа Stripe Tax: «VAT 19%», «GST 10%». Тип и ставка приходят с сервера; неизвестный тип —
 * просто «Tax». Цены магазина включают налог, поэтому подпись всегда идёт с «incl.» на месте показа.
 */
const TYPE_NAMES: Record<string, string> = {
  vat: 'VAT',
  gst: 'GST',
  hst: 'HST',
  pst: 'PST',
  qst: 'QST',
  rst: 'RST',
  jct: 'JCT',
  igst: 'IGST',
  sales_tax: 'sales',
  lease_tax: 'generic',
};
// Переводимые подписи — только у двух типов; аббревиатуры VAT/GST одинаковы во всех языках.
const nameOf = (type?: string | null): string => {
  const known = type ? TYPE_NAMES[type] : undefined;
  if (known === 'sales') return i18n.t('checkout.taxSales');
  if (!known || known === 'generic') return i18n.t('common.tax');
  return known;
};

export const taxLabel = (type?: string | null, ratePercent?: number | null): string => {
  const name = nameOf(type);
  if (ratePercent == null || !Number.isFinite(ratePercent) || ratePercent <= 0) {
    return name;
  }
  // 19 → «19%», 20.5 → «20.5%»: без хвостовых нулей.
  return `${name} ${Number(ratePercent.toFixed(2))}%`;
};
