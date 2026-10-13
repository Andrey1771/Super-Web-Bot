import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DemoAccount } from "./demoApi";

/** Тестовая карта Stripe: в демо оплата идёт в тестовом режиме, настоящие деньги не списываются. */
export const TEST_CARD = "4242 4242 4242 4242";

export const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="demo-copy"
      aria-label={`${t("demo.copy")}: ${label}`}
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
    >
      {copied ? t("demo.copied") : t("demo.copy")}
    </button>
  );
};

/**
 * Демо-аккаунты и тестовая карта — одним блоком: его показывают окно приглашения и панель кружка «Демо».
 * Значения не переносятся по слогам: длинный пароль обрезается многоточием, целиком он копируется кнопкой.
 */
const DemoCredentials: React.FC<{
  accounts: DemoAccount[];
  onSignIn?: (account: DemoAccount) => void;
}> = ({ accounts, onSignIn }) => {
  const { t } = useTranslation();
  return (
    <div className="demo-credentials">
      {accounts.map((account) => (
        <div key={account.username} className="demo-account">
          <div className="demo-account__head">
            <span className="demo-account__role">{account.role === "admin" ? t("demo.roleAdmin") : account.username}</span>
            {onSignIn && (
              <button type="button" className="demo-account__signin" onClick={() => onSignIn(account)}>
                {t("demo.signInAdmin")}
              </button>
            )}
          </div>
          <div className="demo-account__row">
            <span className="demo-account__label">{t("demo.login")}</span>
            <code title={account.username}>{account.username}</code>
            <CopyButton value={account.username} label={t("demo.login")} />
          </div>
          <div className="demo-account__row">
            <span className="demo-account__label">{t("demo.password")}</span>
            <code title={account.password}>{account.password}</code>
            <CopyButton value={account.password} label={t("demo.password")} />
          </div>
        </div>
      ))}
      <div className="demo-card-hint">
        <div className="demo-account__row">
          <span className="demo-account__label">{t("demo.testCard")}</span>
          <code>{TEST_CARD}</code>
          <CopyButton value={TEST_CARD.replace(/ /g, "")} label={t("demo.testCard")} />
        </div>
        <span className="demo-card-hint__note">{t("demo.testCardNote")}</span>
      </div>
    </div>
  );
};

export default DemoCredentials;
