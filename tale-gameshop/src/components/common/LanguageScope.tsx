import React from "react";
import { useSitePreferences } from "../../context/site-preferences";

/**
 * Перемонтирует всё внутри при смене языка сайта. Страницы витрины берут тексты с сервера на языке
 * из Accept-Language (карточки, блог, команда, документы), и без перемонтирования данные оставались бы
 * на прежнем языке, пока эффект загрузки не вспомнит о зависимости от языка. Одно место надёжнее,
 * чем зависимость в каждом эффекте каждой страницы.
 */
const LanguageScope: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { lang } = useSitePreferences();
  return <React.Fragment key={lang}>{children}</React.Fragment>;
};

export default LanguageScope;
