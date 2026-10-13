import React, { useState } from "react";

/** Языки переводов: английское значение — основное поле, остальные — необязательные. */
export const TRANSLATION_LANGS: Array<{ code: "ru" | "uk" | "pl"; label: string }> = [
  { code: "ru", label: "RU" },
  { code: "uk", label: "UK" },
  { code: "pl", label: "PL" },
];

export type I18nMap = Record<string, string> | null | undefined;

type Props = {
  /** Переводы поля по языкам. */
  i18n: I18nMap;
  onI18nChange: (next: Record<string, string>) => void;
  /** Английское поле — как было; показывается на вкладке EN. */
  children: React.ReactNode;
  /** Длинный текст — textarea вместо строки. */
  multiline?: boolean;
  rows?: number;
  /** Подпись поля для aria-label вкладок перевода. */
  label?: string;
  /** Подсказка в пустом переводе — обычно английское значение. */
  placeholder?: string;
};

/**
 * Вкладки языков над полем админки: EN — само поле, как оно было; RU/UK/PL — переводы в словаре *I18n.
 * Пустой перевод означает «показать английское», поэтому вкладка с заполненным переводом помечена точкой.
 */
const LocalizedField: React.FC<Props> = ({ i18n, onI18nChange, children, multiline, rows = 4, label, placeholder }) => {
  const [lang, setLang] = useState<"en" | "ru" | "uk" | "pl">("en");
  const translations = i18n ?? {};
  const setTranslation = (code: string, value: string) => onI18nChange({ ...translations, [code]: value });

  return (
    <div className="localized-field">
      <div className="localized-field__tabs" role="tablist" aria-label={label ? `${label}: languages` : "Languages"} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {[{ code: "en" as const, label: "EN" }, ...TRANSLATION_LANGS].map((item) => {
          const filled = item.code === "en" || Boolean(translations[item.code]?.trim());
          return (
            <button
              key={item.code}
              type="button"
              role="tab"
              aria-selected={lang === item.code}
              className={`btn btn-outline btn-small${lang === item.code ? " is-active" : ""}`}
              style={{ padding: "2px 8px", fontSize: 11, opacity: filled ? 1 : 0.6 }}
              onClick={() => setLang(item.code)}
              title={item.code === "en" ? "English — the default text" : filled ? "Translated" : "No translation yet — English is shown"}
            >
              {item.label}
              {item.code !== "en" && filled ? " •" : ""}
            </button>
          );
        })}
      </div>
      {lang === "en" ? (
        children
      ) : multiline ? (
        <textarea
          className="input"
          rows={rows}
          value={translations[lang] ?? ""}
          placeholder={placeholder}
          aria-label={`${label ?? "Field"} (${lang.toUpperCase()})`}
          onChange={(event) => setTranslation(lang, event.target.value)}
        />
      ) : (
        <input
          className="input"
          value={translations[lang] ?? ""}
          placeholder={placeholder}
          aria-label={`${label ?? "Field"} (${lang.toUpperCase()})`}
          onChange={(event) => setTranslation(lang, event.target.value)}
        />
      )}
    </div>
  );
};

export default LocalizedField;
