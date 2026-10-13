import i18n from '../../i18n';

export type SupportDocCallout = {
    tone: 'info' | 'warning';
    title?: string;
    text: string;
};

export type SupportDocSection = {
    title: string;
    // Абзац-подводка перед списком (опционально).
    intro?: string;
    bullets: string[];
    // true — нумерованные шаги вместо маркеров.
    ordered?: boolean;
    callout?: SupportDocCallout;
};

export type SupportDoc = {
    id: string;
    // Влияет на бейдж в шапке документа: гайд или правила магазина.
    kind: 'guide' | 'policy';
    title: string;
    route: string;
    shortDescription: string;
    lastUpdated: string;
    intro?: string;
    callout?: SupportDocCallout;
    // Главное действие документа (кнопка в шапке), например форма восстановления доступа.
    action?: { label: string; to: string };
    sections: SupportDocSection[];
};

/**
 * Скелет документа: всё, что не текст. Тексты лежат в словарях (src/locales, секция help.docs.<id>)
 * на четырёх языках и подставляются в getSupportDocs() на языке сайта.
 */
type SupportDocSkeleton = {
    id: string;
    kind: 'guide' | 'policy';
    calloutTone?: 'info' | 'warning';
    actionTo?: string;
    // Для каждого раздела: нумерованный ли список и тон врезки (если она есть).
    sections: Array<{ ordered?: boolean; calloutTone?: 'info' | 'warning' }>;
};

/** Текст документа из словаря — та же форма, что у SupportDoc, но без служебных полей. */
type SupportDocText = {
    title: string;
    shortDescription: string;
    lastUpdated: string;
    intro?: string;
    callout?: { title?: string; text: string };
    action?: string;
    sections: Array<{ title: string; intro?: string; bullets: string[]; callout?: { title?: string; text: string } }>;
};

/**
 * Реквизиты в текстах записаны токенами вида {{entity}}, а значения приходят с сервера
 * (секция "Legal" в appsettings, любое поле перекрывается переменной Legal__Entity).
 * Подставляет их страница документа: см. fillLegalTokens в support-doc-page.tsx.
 *
 * Раньше здесь лежали константы с метками [TO FILL] — чтобы сменить название юрлица или
 * адрес, приходилось править исходник и пересобирать витрину.
 *
 * Цифры программы кэшбэка — такими же токенами ({{cashbackExpiryRule}} и т. п.), но из её настроек: см. cashback-terms.ts.
 *
 * Незаполненное значение не подставляется молча: на его месте остаётся видная метка, а
 * документ получает пометку «черновик» — это проверяет legal-docs.test.ts.
 *
 * Токены в словаре совпадают с синтаксисом подстановок i18next, поэтому тексты читаются
 * с skipInterpolation: иначе i18next съел бы {{entity}} ещё до страницы.
 */
const skeletons: SupportDocSkeleton[] = [
    { id: 'activation-guide', kind: 'guide', calloutTone: 'info', sections: [{}, { ordered: true }, { ordered: true }] },
    { id: 'software-activation', kind: 'guide', calloutTone: 'info', sections: [{}, { ordered: true }, { ordered: true }, { ordered: true }, {}, { ordered: true }] },
    { id: 'refund-policy', kind: 'policy', sections: [{}, { ordered: true }, {}] },
    { id: 'payment-methods', kind: 'guide', sections: [{}, {}, {}] },
    { id: 'regional-restrictions', kind: 'policy', sections: [{}, {}, {}] },
    { id: 'account-recovery', kind: 'guide', calloutTone: 'warning', actionTo: '/account-recovery', sections: [{}, { ordered: true }, { calloutTone: 'info' }, {}] },
    { id: 'terms-of-sale', kind: 'policy', sections: [{}, {}, { calloutTone: 'info' }, {}, {}, { calloutTone: 'warning' }, { ordered: true }, {}, {}, {}, {}, {}] },
    { id: 'privacy-policy', kind: 'policy', sections: [{}, { calloutTone: 'info' }, {}, {}, {}, {}, { calloutTone: 'info' }, {}] },
    { id: 'cookie-policy', kind: 'policy', sections: [{}, {}, { calloutTone: 'info' }, { ordered: true }] },
    { id: 'cashback-terms', kind: 'policy', sections: [{}, {}, {}, {}, { calloutTone: 'info' }] },
    { id: 'legal-notice', kind: 'policy', sections: [{}, {}, {}] }
];

const buildDoc = (skeleton: SupportDocSkeleton): SupportDoc => {
    const text = i18n.t(`help.docs.${skeleton.id}`, { returnObjects: true, skipInterpolation: true }) as SupportDocText;
    return {
        id: skeleton.id,
        kind: skeleton.kind,
        title: text.title,
        route: `/support/docs/${skeleton.id}`,
        shortDescription: text.shortDescription,
        lastUpdated: text.lastUpdated,
        intro: text.intro,
        callout: text.callout ? { tone: skeleton.calloutTone ?? 'info', title: text.callout.title, text: text.callout.text } : undefined,
        action: text.action && skeleton.actionTo ? { label: text.action, to: skeleton.actionTo } : undefined,
        sections: text.sections.map((section, index) => {
            const shape = skeleton.sections[index] ?? {};
            return {
                title: section.title,
                intro: section.intro,
                bullets: section.bullets,
                ordered: shape.ordered,
                callout: section.callout ? { tone: shape.calloutTone ?? 'info', title: section.callout.title, text: section.callout.text } : undefined
            };
        })
    };
};

/** Документы поддержки на текущем языке сайта. Вызывать при рендере: язык может смениться без перезагрузки. */
export const getSupportDocs = (): SupportDoc[] => skeletons.map(buildDoc);

/** Английский снимок на момент загрузки модуля — для тестов и кода вне React. В компонентах — getSupportDocs(). */
export const supportDocs: SupportDoc[] = getSupportDocs();
