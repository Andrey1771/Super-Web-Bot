import i18n from '../../i18n';
import type { CashbackProgram } from '../../hooks/use-cashback-program';
import { formatMoney } from '../../utils/format-money';

/**
 * Цифры условий кэшбэка в тексте документа — токенами, как реквизиты юрлица.
 *
 * Сроки и минимум меняются на вкладке Cashback в админке. Страница /rewards берёт их с сервера, а условия раньше
 * были зашиты текстом («held for 14 days», «valid for 12 months») — поменял срок в админке, и юридический текст
 * продолжал обещать старый. Токен подставляет целую фразу, а не одно число: при нулевом сроке фраза «held for 0 days»
 * была бы бессмыслицей, а нужно «can be spent right away».
 *
 * Фразы — из словаря (help.cashbackTerms.*) на языке сайта, с формами множественного числа.
 *
 * Подставляются раньше реквизитов (fillLegalTokens) и всегда имеют значение: пока сервер не ответил — значения по умолчанию.
 */
export const CASHBACK_TERM_TOKENS = ['cashbackHoldRule', 'cashbackMinCardPayment', 'cashbackExpiryRule', 'cashbackEmailsRule'] as const;

const cashbackTermValues = (program: CashbackProgram): Record<(typeof CASHBACK_TERM_TOKENS)[number], string> => ({
    cashbackHoldRule: program.pendingDays > 0
        ? i18n.t('help.cashbackTerms.holdRule', { count: program.pendingDays })
        : i18n.t('help.cashbackTerms.holdNow'),
    cashbackMinCardPayment: formatMoney(program.minCardPayment, program.currency),
    cashbackExpiryRule: program.expiryMonths > 0
        ? i18n.t('help.cashbackTerms.expiryRule', { count: program.expiryMonths })
        : i18n.t('help.cashbackTerms.noExpiry'),
    cashbackEmailsRule: !program.emailNotices
        ? i18n.t('help.cashbackTerms.emailsOff')
        : program.expiryReminderDays > 0 && program.expiryMonths > 0
            ? i18n.t('help.cashbackTerms.emailsReminder', { count: program.expiryReminderDays })
            : i18n.t('help.cashbackTerms.emailsOn'),
});

/** Подставляет цифры программы кэшбэка; остальные токены ({{entity}} и т. п.) не трогает. */
export const fillCashbackTokens = (text: string, program: CashbackProgram): string => {
    const values = cashbackTermValues(program) as Record<string, string>;
    return text.replace(/{{(cashback[A-Za-z]+)}}/g, (match, key: string) => values[key] ?? match);
};
