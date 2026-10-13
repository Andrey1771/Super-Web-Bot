import { bodyI18nForSave, tagsI18nToText, tagsTextToI18n } from "./blog-i18n";

describe("blog editor translations", () => {
  it("round-trips tag translations through the comma field keeping empty positions", () => {
    const text = tagsI18nToText({ ru: ["Гайды", "", "Поддержка"] });
    expect(text).toEqual({ ru: "Гайды, , Поддержка" });
    expect(tagsTextToI18n({ ...text, pl: "   " })).toEqual({ ru: ["Гайды", "", "Поддержка"] });
  });

  it("re-renders translated html from markdown in markdown mode", () => {
    const saved = bodyI18nForSave({ ru: "# Заголовок" }, { ru: "<p>stale</p>" }, "markdown");
    expect(saved.contentMarkdownI18n).toEqual({ ru: "# Заголовок" });
    expect(saved.contentHtmlI18n.ru).toContain("<h1");
    expect(saved.contentHtmlI18n.ru).not.toContain("stale");
  });

  it("keeps typed html in html mode and renders markdown only where html is empty", () => {
    const saved = bodyI18nForSave({ ru: "# Заголовок", uk: "**жирний**" }, { ru: "<p>typed</p>" }, "html");
    expect(saved.contentHtmlI18n.ru).toBe("<p>typed</p>");
    expect(saved.contentHtmlI18n.uk).toContain("<strong>");
  });

  it("drops languages without any text", () => {
    expect(bodyI18nForSave({ ru: "  " }, { ru: "" }, "markdown")).toEqual({ contentMarkdownI18n: {}, contentHtmlI18n: {} });
  });
});
