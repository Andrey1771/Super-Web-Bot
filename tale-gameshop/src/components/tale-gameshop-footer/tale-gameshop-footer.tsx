import React from "react";
import "./tale-gameshop-footer.css";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAnalyticsConsent } from "../analytics/AnalyticsProvider";
import { useGameGenres } from "../../hooks/use-game-genres";
import { useSoftwareCategories } from "../../hooks/use-software-categories";
import { gamesCatalogPath, softwareCatalogPath } from "../../utils/software";
import { useSocialLinks } from "../../hooks/use-social-links";
import type { SocialNetwork } from "../../api/socialApi";

// Иконки сетей, которые умеет показывать подвал. Адреса профилей задаёт владелец в настройках
// сайта (Admin → Settings → Social links); сеть без адреса в подвал не попадает.
const socialIcons: Record<SocialNetwork, { label: string; path: string }> = {
  telegram: {
    label: "Telegram",
    path:
      "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  },
  discord: {
    label: "Discord",
    path:
      "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z",
  },
  x: {
    label: "X",
    path:
      "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
};

// Сколько жанров показывает подвал. Ровно столько же ссылок в «Company» и «Legal»,
// поэтому низ колонок выходит вровень; при шести колонка жанров была на 91px глубже
// соседних, и правая половина подвала обрывалась лесенкой.
const FOOTER_GENRE_LIMIT = 4;

export default function TaleGameshopFooter() {
  const { t } = useTranslation();
  // Сети с адресом в настройках сайта; остальные иконки подвал не показывает.
  const socialLinks = useSocialLinks().filter((link) => link.network in socialIcons);
  const { analyticsAvailable, settingsLoaded, setSettingsOpen } = useAnalyticsConsent();
  // Жанры — из списка админки, адрес — код жанра: он не меняется при переименовании.
  // Только самые наполненные: полный список делал колонку вдвое выше соседних. За остальным — «All games».
  // Каталог недоступен — колонка жанров просто не рисуется.
  const { genres: allGenres } = useGameGenres();
  const genres = [...allGenres]
    .filter((genre) => genre.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, FOOTER_GENRE_LIMIT);
  const year = new Date().getFullYear();
  // Про ПО говорим, только когда оно реально продаётся: иначе подвал обещал бы раздел, в котором пусто.
  const { total: softwareTotal } = useSoftwareCategories();
  const sellsSoftware = softwareTotal > 0;


  return (
    <footer className="footer">
      <i className="fx-texture" aria-hidden="true"></i>
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo">{t("common.brand")}</div>
            <p>{sellsSoftware ? t("footer.taglineGamesSoftware") : t("footer.taglineGames")}</p>

            {socialLinks.length > 0 && (
              <div className="footer-social" aria-label={t("footer.socialMedia")}>
                {socialLinks.map((link) => (
                  <a
                    key={link.network}
                    className="icon-circle"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={socialIcons[link.network].label}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                      <path fill="currentColor" d={socialIcons[link.network].path} />
                    </svg>
                  </a>
                ))}
              </div>
            )}
          </div>

          <nav className="footer-columns" aria-label={t("footer.columns")}>
            <div className="footer-column">
              <div className="footer-title">{t("footer.store")}</div>
              <Link to={gamesCatalogPath()}>{t("header.allGames")}</Link>
              {sellsSoftware && <Link to={softwareCatalogPath()}>{t("common.nav.software")}</Link>}
              <Link to="/deals">{t("common.nav.deals")}</Link>
              <Link to={gamesCatalogPath({ filterMaxPrice: '20' })}>{t("header.budgetPicks")}</Link>
              <Link to="/rewards">{t("common.nav.cashback")}</Link>
            </div>

            {/* Ссылки на страницы жанров. Живут здесь, а не над каталогом: место в подвале
                бесплатно, а без единой ссылки эти страницы не нашёл бы ни человек,
                ни поисковик. Список настоящий — приходит из фасетов каталога. */}
            {genres.length > 0 && (
              <div className="footer-column">
                <div className="footer-title">{t("footer.genres")}</div>
                {genres.map((genre) => (
                  <Link key={genre.tag} to={`/games/category/${genre.tag}`}>
                    {genre.label ?? genre.title}
                  </Link>
                ))}
              </div>
            )}

            <div className="footer-column">
              <div className="footer-title">{t("footer.company")}</div>
              <Link to="/about">{t("common.nav.about")}</Link>
              <Link to="/news">{t("common.nav.news")}</Link>
              <Link to="/support">{t("common.nav.support")}</Link>
              <Link to="/faq">{t("common.nav.faq")}</Link>
              {/* Кнопка, а не ссылка: открывает выбор, а не текст про него. Стоит здесь,
                  а не в «Legal» рядом с документом про cookie: там колонка становилась
                  на строку выше соседних, а тут ровно уравнивает их. */}
              {settingsLoaded && analyticsAvailable && (
                <button className="footer-link-button" onClick={() => setSettingsOpen(true)} type="button">
                  {t("footer.cookieSettings")}
                </button>
              )}
            </div>

            <div className="footer-column">
              <div className="footer-title">{t("footer.legal")}</div>
              <Link to="/support/docs/terms-of-sale">{t("footer.terms")}</Link>
              <Link to="/support/docs/privacy-policy">{t("footer.privacy")}</Link>
              <Link to="/support/docs/refund-policy">{t("footer.refunds")}</Link>
              {/* Условия отдельным документом, а не только в FAQ на витрине: программа
                  умеет забирать начисленное обратно и сгорать, и такое место в
                  маркетинговой гармошке — не место. */}
              <Link to="/support/docs/cashback-terms">{t("footer.cashbackTerms")}</Link>
              <Link to="/support/docs/cookie-policy">{t("footer.cookies")}</Link>
              <Link to="/support/docs/legal-notice">{t("footer.legalNotice")}</Link>
            </div>
          </nav>
        </div>

        <div className="footer-divider" />

        <div className="footer-bottom">
          <div className="footer-meta">
            <span>{t("footer.rights", { year })}</span>
            <span className="footer-disclaimer">
              {sellsSoftware ? t("footer.disclaimerGamesSoftware") : t("footer.disclaimerGames")}
            </span>
          </div>

          <div className="footer-bottom-right">
            {/* Значки на белых плашках, как на любой витрине: раньше это были четыре серые
                капсулы со словами «VISA», «Mastercard» и т.д. — на тёмном подвале они
                читались как заглушки, а не как знак того, чем можно платить.

                Знак Mastercard нарисован точно — это два круга. Остальные три —
                словесные марки, и здесь они набраны нашим шрифтом в фирменном цвете:
                узнаваемо, но это не официальные начертания. Когда будут файлы логотипов
                от платёжных систем, их надо положить сюда вместо этих трёх. */}
            <div className="footer-payments" aria-label={t("footer.paymentMethods")}>
              <span className="pay-badge" title="Visa">
                <span className="pay-visa">VISA</span>
              </span>
              <span className="pay-badge" title="Mastercard">
                <svg viewBox="0 0 40 24" width="34" height="21" role="img" aria-label="Mastercard">
                  <circle cx="15" cy="12" r="9" fill="#eb001b" />
                  <circle cx="25" cy="12" r="9" fill="#f79e1b" />
                  {/* Пересечение кругов — третий цвет марки. */}
                  <path
                    d="M20 5.2a9 9 0 0 0 0 13.6 9 9 0 0 0 0-13.6z"
                    fill="#ff5f00"
                  />
                </svg>
              </span>
              <span className="pay-badge" title="American Express">
                <span className="pay-amex">AMEX</span>
              </span>
              <span className="pay-badge" title="Stripe">
                <span className="pay-stripe">stripe</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
