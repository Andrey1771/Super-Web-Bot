import i18n from '../../i18n';

export type FaqItem = {
    id: string;
    question: string;
    answer: string;
};

/** Порядок вопросов в кабинете; тексты — в словарях (help.faq.<id>) на языке сайта. */
export const FAQ_IDS = [
    'where-is-my-game-key',
    'how-do-refunds-work',
    'payment-charged-order-missing',
    'download-invoice',
    'activate-steam-key',
    'secure-account'
] as const;

export const getFaqItems = (): FaqItem[] =>
    FAQ_IDS.map((id) => ({
        id,
        question: i18n.t(`help.faq.${id}.question`),
        answer: i18n.t(`help.faq.${id}.answer`)
    }));

/** Английский снимок на момент загрузки — для кода вне React. В компонентах — getFaqItems(). */
export const faqItems: FaqItem[] = getFaqItems();
