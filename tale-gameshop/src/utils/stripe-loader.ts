// ВАЖНО: именно "/pure".
// Обычная точка входа @stripe/stripe-js вставляет <script src="js.stripe.com/v3"> сразу
// при импорте модуля — Stripe так собирает сигналы антифрода со всех страниц сайта.
// Сборка у нас единым бандлом, поэтому импорт случается на любой странице, и скрипт
// уходил в сеть даже там, где платить нечем. Вариант "/pure" такого побочного эффекта
// не имеет: скрипт грузится при первом вызове loadStripe, то есть по требованию.
import { loadStripe } from "@stripe/stripe-js/pure";
// Тип берём из обычной точки входа: import type стирается при сборке, побочного эффекта нет.
import type { Stripe } from "@stripe/stripe-js";

/**
 * Stripe.js тянется с их CDN и только по требованию.
 *
 * Раньше загрузка стояла на верхнем уровне модулей оплаты, а сборка не разрезана на куски —
 * значит скрипт с js.stripe.com запрашивался на КАЖДОЙ странице, даже там, где платить
 * нечем: на главной, в списке ключей, в настройках. Где Stripe недоступен, это ещё и давало
 * ошибку в консоли на ровном месте.
 *
 * Компромисс осознанный: Stripe советует грузить их скрипт всюду ради сигналов
 * антифрода. Но платёж у нас на двух экранах, и цена «скрипт стороннего сервиса на каждой
 * странице» за эти сигналы великовата.
 */
let cachedStripe: Promise<Stripe | null> | null | undefined;

/**
 * Отдаёт Stripe.js, загружая его при первом обращении. null — ключ не настроен;
 * вызывающий показывает это человеком, а не пустым местом.
 */
export const getStripe = (): Promise<Stripe | null> | null => {
  if (cachedStripe === undefined) {
    const publishableKey = typeof window !== "undefined"
      ? window.__APP_CONFIG__?.stripePublishableKey ?? ""
      : "";
    cachedStripe = createStripePromise(publishableKey);
  }

  return cachedStripe;
};

export const createStripePromise = (publishableKey: string): Promise<Stripe | null> | null => {
  if (!publishableKey) {
    return null;
  }

  return loadStripe(publishableKey).catch((error) => {
    console.warn("Failed to load Stripe.js", error);
    return null;
  });
};
