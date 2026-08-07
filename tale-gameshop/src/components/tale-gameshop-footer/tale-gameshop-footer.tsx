import React from "react";
import "./tale-gameshop-footer.css";
import { Link } from "react-router-dom";
import { useAnalyticsConsent } from "../analytics/AnalyticsProvider";
import { useSitePreferences, type LangCode } from "../../context/site-preferences";

// TODO: replace with the store's real social profiles.
const socialLinks = [
  {
    label: "Telegram",
    href: "https://t.me/taleshop",
    path:
      "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  },
  {
    label: "Discord",
    href: "https://discord.gg/taleshop",
    path:
      "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z",
  },
  {
    label: "X",
    href: "https://x.com/taleshop",
    path:
      "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
];

export default function TaleGameshopFooter() {
  const { analyticsAvailable, settingsLoaded, setSettingsOpen } = useAnalyticsConsent();
  const year = new Date().getFullYear();

  // Shared source of truth — the same store the header language switch writes to.
  const { lang, setLang, languages: languageOptions } = useSitePreferences();

  return (
    <footer className="footer">
      <i className="fx-texture" aria-hidden="true"></i>
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo">Tale Shop</div>
            <p>Curated PC game keys — secure checkout, instant delivery.</p>
            <div className="footer-social" aria-label="Social media">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  className="icon-circle"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <nav className="footer-columns" aria-label="Footer">
            <div className="footer-column">
              <div className="footer-title">Store</div>
              <Link to="/games">All games</Link>
              <Link to="/deals">Deals</Link>
              <Link to="/games?filterMaxPrice=20">Budget picks</Link>
            </div>

            <div className="footer-column">
              <div className="footer-title">Company</div>
              <Link to="/about">About</Link>
              <Link to="/news">News</Link>
              <Link to="/support">Support</Link>
              <Link to="/faq">Help / FAQ</Link>
            </div>

            <div className="footer-column">
              <div className="footer-title">Legal</div>
              <Link to="/apologyPage">Terms</Link>
              <Link to="/apologyPage">Privacy</Link>
              <Link to="/support/docs/refund-policy">Refunds</Link>
              {settingsLoaded && analyticsAvailable && (
                <button className="footer-link-button" onClick={() => setSettingsOpen(true)} type="button">
                  Cookie settings
                </button>
              )}
            </div>
          </nav>
        </div>

        <div className="footer-divider" />

        <div className="footer-bottom">
          <div className="footer-meta">
            <span>© {year} Tale Shop. All rights reserved.</span>
            <span className="footer-disclaimer">
              A digital marketplace for PC game keys. All trademarks and game titles are the property
              of their respective owners.
            </span>
          </div>

          <div className="footer-bottom-right">
            <label className="footer-lang" aria-label="Language">
              <svg className="footer-lang-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2.5 2.5 15.5 0 18m0-18c-2.5 2.5-2.5 15.5 0 18M3.5 9h17M3.5 15h17"
                />
              </svg>
              <select
                className="footer-lang-select"
                value={lang}
                onChange={(e) => setLang(e.target.value as LangCode)}
              >
                {languageOptions.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="footer-payments" aria-label="Accepted payment methods">
              <span className="pill">VISA</span>
              <span className="pill">Mastercard</span>
              <span className="pill">AMEX</span>
              <span className="pill">Stripe</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
