import { getSupportDocs, supportDocs } from './docs';
import type { SupportDoc } from './docs';
import { applyLanguage } from '../../i18n';
import { LEGAL_FIELDS } from '../../api/legalApi';
import { CASHBACK_TERM_TOKENS } from './cashback-terms';

/**
 * Страж юридических документов.
 *
 * Реквизиты в текстах записаны токенами {{...}}, а значения приходят из настроек сервера.
 * Опечатка в имени токена ничем себя не выдаёт: страница просто нарисует «[TO FILL: entty]»,
 * и документ навсегда останется черновиком по неизвестной причине. Здесь проверяется, что
 * каждый токен существует, и что за токенами не спрятались старые метки-заглушки.
 */

const allText = (doc: SupportDoc): string[] => [
    doc.title,
    doc.shortDescription,
    doc.lastUpdated,
    doc.intro ?? '',
    doc.callout?.title ?? '',
    doc.callout?.text ?? '',
    ...doc.sections.flatMap((section) => [
        section.title,
        section.intro ?? '',
        section.callout?.title ?? '',
        section.callout?.text ?? '',
        ...section.bullets
    ])
];

/**
 * Токены ищем посимвольно, без регулярного выражения: фигурные скобки в нём требуют
 * экранирования, а оно тут уже дважды терялось при правке файла — и проверка молча
 * переставала находить что-либо.
 */
const tokensOf = (doc: SupportDoc): string[] =>
    allText(doc).flatMap((text) => {
        const found: string[] = [];
        let from = 0;
        for (;;) {
            const open = text.indexOf('{{', from);
            if (open < 0) break;
            const close = text.indexOf('}}', open + 2);
            if (close < 0) break;
            found.push(text.slice(open + 2, close));
            from = close + 2;
        }
        return found;
    });
it('only uses placeholders the server actually sends', () => {
    // Реквизиты приходят из настроек Legal, цифры кэшбэка — из его программы.
    const known = new Set<string>([...LEGAL_FIELDS, ...CASHBACK_TERM_TOKENS]);
    const unknown = supportDocs.flatMap(tokensOf).filter((token) => !known.has(token));

    expect(unknown).toEqual([]);
});

it('keeps the legal documents on the routes the footer links to', () => {
    const routes = supportDocs.map((doc) => doc.route);

    expect(routes).toContain('/support/docs/terms-of-sale');
    expect(routes).toContain('/support/docs/privacy-policy');
    expect(routes).toContain('/support/docs/cookie-policy');
    expect(routes).toContain('/support/docs/legal-notice');
});

it('keeps the placeholders intact in every language', async () => {
    // Токены совпадают с синтаксисом подстановок i18next — словарь читается без интерполяции.
    for (const lang of ['ru', 'uk', 'pl'] as const) {
        await applyLanguage(lang);
        const docs = getSupportDocs();
        expect(docs.map((doc) => doc.id)).toEqual(supportDocs.map((doc) => doc.id));
        const terms = docs.find((doc) => doc.id === 'terms-of-sale')!;
        expect(terms.title).not.toBe('Terms of sale');
        expect(tokensOf(terms)).toEqual(tokensOf(supportDocs.find((doc) => doc.id === 'terms-of-sale')!));
        expect(docs.flatMap(tokensOf).filter((token) => !new Set<string>([...LEGAL_FIELDS, ...CASHBACK_TERM_TOKENS]).has(token))).toEqual([]);
    }
    await applyLanguage('en');
});

it('no longer carries hardcoded blanks in the text itself', () => {
    // Метки [TO FILL] теперь появляются только в отрисовке — как признак незаполненной
    // настройки. Встретить их в исходном тексте значит, что кто-то снова вписал реквизит руками.
    const hardcoded = supportDocs.filter((doc) => allText(doc).some((text) => text.includes('[TO FILL')));

    expect(hardcoded.map((doc) => doc.id)).toEqual([]);
});
