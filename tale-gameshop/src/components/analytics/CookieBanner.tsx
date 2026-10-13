import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAnalyticsConsent } from "./AnalyticsProvider";
import "./cookie-banner.css";

/**
 * Печенье. Нарисовано здесь, а не картинкой: две дюжины строк разметки весят меньше запроса
 * за файлом, масштабируются без размытия и не мигают пустотой, пока грузятся.
 */
const CookieIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="cookie-dough" cx="35%" cy="30%">
        <stop offset="0%" stopColor="#f0c489" />
        <stop offset="100%" stopColor="#d99b57" />
      </radialGradient>
    </defs>
    {/* Надкус справа сверху — иначе кружок читается как монета, а не печенье. */}
    <path
      d="M24 3c3 0 4 2.6 6.6 3.2 2.7.6 4.6-1 6 1.2 1.4 2.2-.4 4.2.6 6.6 1 2.4 3.6 3 3.6 6.2 0 11.6-9.4 21-21 21S1 32.6 1 21 8.6 3 24 3Z"
      fill="url(#cookie-dough)"
      stroke="#b97e3f"
      strokeWidth="1.4"
    />
    <circle cx="16" cy="17" r="2.6" fill="#6b4423" />
    <circle cx="27" cy="14" r="2" fill="#6b4423" />
    <circle cx="31" cy="25" r="2.4" fill="#6b4423" />
    <circle cx="19" cy="29" r="2.2" fill="#6b4423" />
    <circle cx="10" cy="24" r="1.6" fill="#6b4423" />
    <circle cx="24" cy="34" r="1.7" fill="#6b4423" />
  </svg>
);

/**
 * Согласие на cookie: небольшая карточка в углу, подробный выбор — отдельным окном.
 *
 * Полоса во всю ширину с раскрывающимися настройками разрасталась в пол-экрана и закрывала
 * страницу ровно в тот момент, когда человек в неё вчитывается. Карточка занимает угол и не
 * мешает читать, а разбор по категориям живёт в окне, куда переходят осознанно.
 */
const CookieBanner: React.FC = () => {
  const { t } = useTranslation();
  const { consent, shouldShowBanner, isSettingsOpen, setSettingsOpen, updateConsent } = useAnalyticsConsent();
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(consent === true);

  useEffect(() => {
    setAnalyticsEnabled(consent === true);
  }, [consent]);

  // Escape закрывает окно настроек — как и любое модальное окно на сайте.
  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSettingsOpen, setSettingsOpen]);

  const handleAccept = () => updateConsent(true);
  const handleReject = () => updateConsent(false);
  const handleSaveSettings = () => updateConsent(analyticsEnabled);

  if (!shouldShowBanner) {
    return null;
  }

  return (
    <>
      {/* Карточка прячется, пока открыто окно настроек: две плашки об одном и том же
          одновременно — шум. */}
      {!isSettingsOpen && (
        <div className="cookie-card" role="dialog" aria-live="polite" aria-label={t("cookies.settings")}>
          {/* Печенье стоит рядом с заголовком, а не отдельной колонкой слева: так оно читается
              знаком раздела, а не посторонней картинкой, отодвинувшей текст. */}
          <h4 className="cookie-card__title">
            <CookieIcon className="cookie-card__cookie" />
            {t("cookies.preferences")}
          </h4>
          <p className="cookie-card__text">{t("cookies.intro")}</p>

          {/* Две кнопки, и обе — решение в один клик. Пара «принять / открыть настройки»
              выглядела бы аккуратнее, но тогда согласие стоит одно нажатие, а отказ три:
              именно за такое неравенство регуляторы и штрафуют. Подробный разбор открывается
              ссылкой ниже и из подвала. */}
          <div className="cookie-card__actions">
            <button className="cookie-btn cookie-btn--primary" onClick={handleAccept} type="button">
              {t("cookies.accept")}
            </button>
            <button className="cookie-btn cookie-btn--ghost" onClick={handleReject} type="button">
              {t("cookies.necessaryOnly")}
            </button>
          </div>

          <div className="cookie-card__links">
            <button
              className="cookie-card__link"
              onClick={() => setSettingsOpen(true)}
              type="button"
              aria-expanded={isSettingsOpen}
            >
              {t("cookies.whatWeStore")}
            </button>
            {/* Настройки показывают выбор, документ объясняет его последствия — это
                разные вещи, и ссылаться баннер должен на обе. */}
            <Link className="cookie-card__link" to="/support/docs/cookie-policy">
              {t("cookies.policy")}
            </Link>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="cookie-modal" role="presentation" onClick={() => setSettingsOpen(false)}>
          <div
            className="cookie-modal__card"
            role="dialog"
            aria-modal="true"
            aria-label={t("cookies.preferences")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cookie-modal__head">
              <CookieIcon className="cookie-modal__cookie" />
              <div>
                <h3 className="cookie-modal__title">{t("cookies.preferences")}</h3>
                <p className="cookie-card__text">{t("cookies.chooseIntro")}</p>
              </div>
              <button
                className="cookie-modal__close"
                onClick={() => setSettingsOpen(false)}
                type="button"
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>

            <div className="cookie-modal__list">
              <div className="cookie-option">
                <div>
                  <div className="cookie-option__title">{t("cookies.essentialTitle")}</div>
                  <p className="cookie-card__text">{t("cookies.essentialText")}</p>
                </div>
                {/* Не переключатель: выключить их нельзя, и притворяться, что можно, — врать. */}
                <span className="cookie-option__always">{t("cookies.alwaysOn")}</span>
              </div>

              <label className="cookie-option cookie-option--interactive">
                <div>
                  <div className="cookie-option__title">{t("cookies.analyticsTitle")}</div>
                  <p className="cookie-card__text">{t("cookies.analyticsText")}</p>
                </div>
                <input
                  type="checkbox"
                  className="cookie-switch"
                  checked={analyticsEnabled}
                  onChange={(event) => setAnalyticsEnabled(event.target.checked)}
                  aria-label={t("cookies.analyticsTitle")}
                />
              </label>
            </div>

            <div className="cookie-modal__actions">
              <button className="cookie-btn cookie-btn--ghost" onClick={handleReject} type="button">
                {t("cookies.reject")}
              </button>
              <button className="cookie-btn cookie-btn--primary" onClick={handleSaveSettings} type="button">
                {t("cookies.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CookieBanner;
