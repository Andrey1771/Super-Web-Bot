import type { Appearance, StripeElementLocale, StripeElementsOptions } from '@stripe/stripe-js';
import type { LangCode } from '../../../context/site-preferences';

/** Локаль формы Stripe по языку сайта. Украинского у Stripe нет — форма остаётся на языке браузера. */
export const stripeLocaleFor = (lang: LangCode): StripeElementLocale =>
    lang === 'ru' ? 'ru' : lang === 'pl' ? 'pl' : lang === 'en' ? 'en' : 'auto';

/**
 * Настройки Stripe Elements для кассы.
 *
 * customerSessionClientSecret приходит только вошедшему покупателю: с ним форма карты показывает его сохранённые
 * карты и галочку «сохранить эту карту» (по умолчанию снята). Гостю ключа нет, и поле не передаётся вовсе.
 */
export const buildStripeElementsOptions = (input: {
    clientSecret: string | null;
    customerSessionClientSecret: string | null;
    appearance: Appearance;
    locale?: StripeElementLocale;
}): StripeElementsOptions => {
    const options: StripeElementsOptions = {
        clientSecret: input.clientSecret ?? undefined,
        appearance: input.appearance,
        locale: input.locale ?? 'en',
    };
    if (input.customerSessionClientSecret) {
        options.customerSessionClientSecret = input.customerSessionClientSecret;
    }
    return options;
};
