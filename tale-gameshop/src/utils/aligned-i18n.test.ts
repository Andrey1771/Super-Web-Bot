import { realignI18n } from "./aligned-i18n";

describe("realignI18n", () => {
  const i18n = { ru: ["Гайды", "Скидки", "Поддержка"], pl: ["Poradniki", "", "Wsparcie"] };
  const tags = ["Guides", "Deals", "Support"];

  it("keeps translations attached to their values when a tag is removed", () => {
    expect(realignI18n(tags, ["Deals", "Support"], i18n)).toEqual({ ru: ["Скидки", "Поддержка"], pl: ["", "Wsparcie"] });
  });

  it("follows values when tags are reordered", () => {
    expect(realignI18n(tags, ["Support", "Guides", "Deals"], i18n).ru).toEqual(["Поддержка", "Гайды", "Скидки"]);
  });

  it("keeps the translation of a tag renamed in place", () => {
    expect(realignI18n(tags, ["Guides", "Sales", "Support"], i18n).ru).toEqual(["Гайды", "Скидки", "Поддержка"]);
  });

  it("leaves a new tag without translation", () => {
    expect(realignI18n(tags, [...tags, "News"], i18n).ru).toEqual(["Гайды", "Скидки", "Поддержка", ""]);
  });

  it("copes with missing dictionaries", () => {
    expect(realignI18n(tags, tags, null)).toEqual({});
    expect(realignI18n(tags, ["Deals"], { ru: [] })).toEqual({ ru: [""] });
  });
});
