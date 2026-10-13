import i18n from '../../i18n';
import {getSupportDocs, type SupportDoc} from './docs';

export type SupportDocGroup = {
    title: string;
    docs: SupportDoc[];
};

/**
 * Как документы поддержки раскладываются по темам в кабинете. Один столбик из двенадцати ссылок
 * читался плохо, а карточка вытягивала соседей по сетке.
 *
 * Документ, которого нет ни в одной группе, не пропадает: он попадает в «Other», это проверяет тест.
 * Названия групп — из словаря (help.docGroups.<key>) на языке сайта.
 */
const groupLayout: Array<{ key: string; ids: string[] }> = [
    {key: 'activation', ids: ['activation-guide', 'software-activation']},
    {key: 'orders', ids: ['payment-methods', 'refund-policy', 'regional-restrictions', 'cashback-terms']},
    {key: 'account', ids: ['account-recovery']},
    {key: 'legal', ids: ['terms-of-sale', 'privacy-policy', 'cookie-policy', 'legal-notice']}
];

export const groupSupportDocs = (docs: SupportDoc[] = getSupportDocs()): SupportDocGroup[] => {
    const byId = new Map(docs.map((doc) => [doc.id, doc]));
    const placed = new Set<string>();
    const groups: SupportDocGroup[] = [];

    for (const layout of groupLayout) {
        const members = layout.ids
            .map((id) => byId.get(id))
            .filter((doc): doc is SupportDoc => Boolean(doc));
        members.forEach((doc) => placed.add(doc.id));
        if (members.length > 0) {
            groups.push({title: i18n.t(`help.docGroups.${layout.key}`), docs: members});
        }
    }

    const rest = docs.filter((doc) => !placed.has(doc.id));
    if (rest.length > 0) {
        groups.push({title: i18n.t('help.docGroups.other'), docs: rest});
    }
    return groups;
};

/** Английский снимок на момент загрузки — для тестов. В компонентах — groupSupportDocs(). */
export const supportDocGroups = groupSupportDocs();
