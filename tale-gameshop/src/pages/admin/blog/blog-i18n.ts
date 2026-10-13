import { renderMarkdown } from "../../../utils/markdown";

export type I18nText = Record<string, string>;

/** Переводы тегов хранятся списками по позициям; в поле они вводятся через запятую, как английские. */
export const tagsI18nToText = (value?: Record<string, string[]> | null): I18nText =>
  Object.fromEntries(Object.entries(value ?? {}).map(([lang, list]) => [lang, (list ?? []).join(", ")]));

export const tagsTextToI18n = (value: I18nText): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(value)
      .filter(([, text]) => text.trim())
      // Пустые позиции сохраняются («a, , b»), чтобы перевод не съехал относительно английского тега.
      .map(([lang, text]) => [lang, text.split(",").map((item) => item.trim())])
  );

/** Тело статьи на каждом языке: html — введённый, иначе собранный из markdown (как у английского). */
export const bodyI18nForSave = (markdown: I18nText, html: I18nText, mode: "markdown" | "html") => {
  const langs = new Set([...Object.keys(markdown), ...Object.keys(html)]);
  const contentMarkdownI18n: I18nText = {};
  const contentHtmlI18n: I18nText = {};
  langs.forEach((lang) => {
    const md = markdown[lang]?.trim() ?? "";
    const rawHtml = html[lang]?.trim() ?? "";
    // В режиме markdown html пересобирается из текста, чтобы старый рендер не пережил правку.
    const rendered = mode === "markdown" ? (md ? renderMarkdown(md) : rawHtml) : rawHtml || (md ? renderMarkdown(md) : "");
    if (md) contentMarkdownI18n[lang] = md;
    if (rendered) contentHtmlI18n[lang] = rendered;
  });
  return { contentMarkdownI18n, contentHtmlI18n };
};
