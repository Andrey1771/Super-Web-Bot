import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useKeycloak } from "@react-keycloak/web";
import { useToast } from "../../components/ui/ToastProvider";
import { currentLang } from "../../context/site-preferences";
import {
  DEMO_EVENT,
  getDemoConfig,
  getDemoMailbox,
  openDemoSandbox,
  resetDemoSandbox,
  type DemoAccount,
  type DemoConfig,
  type DemoLetter,
  type DemoRefusalCode,
} from "./demoApi";
import "./demo-layer.css";

/** Тестовая карта Stripe: в демо оплата идёт в тестовом режиме, настоящие деньги не списываются. */
const TEST_CARD = "4242 4242 4242 4242";

const remaining = (expiresAt: string, now: number) => {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60000));
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
};

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
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
 * Демо-сайт для портфолио: полоска сверху (своя копия магазина и сколько ей осталось), приглашение открыть копию
 * с демо-аккаунтами и тестовой картой, демо-почта. На обычном магазине сервер отвечает «демо выключено» — и слой
 * ничего не рисует.
 */
const DemoLayer: React.FC = () => {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { keycloak, initialized } = useKeycloak();
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  // Свернуть до значка «Демо» — чтобы полоска не мешала на видео и на телефоне.
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem("demo-bar-collapsed") === "1");
  const toggleCollapsed = () => {
    setCollapsed((value) => {
      sessionStorage.setItem("demo-bar-collapsed", value ? "0" : "1");
      return !value;
    });
  };
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    getDemoConfig()
      .then((value) => {
        setConfig(value);
        // Первый заход без копии — сразу объясняем, что это за сайт.
        if (value.enabled && !value.sandbox && sessionStorage.getItem("demo-welcome-seen") !== "1") {
          setWelcomeOpen(true);
        }
      })
      .catch(() => setConfig({ enabled: false }));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Отказы сервера по правилам демо (см. demoEvents): без копии — приглашение, «только просмотр» — пояснение.
  useEffect(() => {
    const onRefusal = (event: Event) => {
      const code = (event as CustomEvent<{ code: DemoRefusalCode }>).detail?.code;
      if (code === "demo_sandbox_required") {
        setWelcomeOpen(true);
      } else if (code === "demo_readonly") {
        addToast(t("demo.readonly"), "info");
      }
    };
    window.addEventListener(DEMO_EVENT, onRefusal);
    return () => window.removeEventListener(DEMO_EVENT, onRefusal);
  }, [addToast, t]);

  const sandbox = config?.sandbox ?? null;
  const left = useMemo(() => (sandbox ? remaining(sandbox.expiresAt, now) : null), [sandbox, now]);

  if (!config?.enabled) {
    return null;
  }

  const closeWelcome = () => {
    sessionStorage.setItem("demo-welcome-seen", "1");
    setWelcomeOpen(false);
  };

  const openSandbox = async () => {
    setBusy(true);
    try {
      await openDemoSandbox();
      sessionStorage.setItem("demo-welcome-seen", "1");
      // Страница перечитывается целиком: всё, что уже загружено, — из общего шаблона, а не из копии.
      window.location.reload();
    } catch (error: unknown) {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      addToast(code === "demo_full" ? t("demo.full") : code === "demo_ip_limit" ? t("demo.ipLimit") : t("demo.openFailed"), "error");
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await resetDemoSandbox();
      window.location.reload();
    } catch {
      addToast(t("demo.resetFailed"), "error");
      setBusy(false);
    }
  };

  const signIn = (account: DemoAccount) => {
    keycloak.login({ loginHint: account.username, redirectUri: window.location.href, locale: currentLang() });
  };

  return (
    <>
      <div className={`demo-bar${collapsed ? " is-collapsed" : ""}`} role="region" aria-label={t("demo.barLabel")}>
        <div className="demo-bar__inner">
          <button
            type="button"
            className="demo-bar__toggle"
            aria-expanded={!collapsed}
            title={collapsed ? t("demo.expand") : t("demo.collapse")}
            onClick={toggleCollapsed}
          >
            <span className="demo-bar__badge">{t("demo.badge")}</span>
          </button>
          {!collapsed && (
            <>
          {sandbox && left ? (
            <span className="demo-bar__text">{t("demo.ownCopy", { hours: left.hours, minutes: left.minutes })}</span>
          ) : (
            <span className="demo-bar__text">{t("demo.templateHint")}</span>
          )}
          <span className="demo-bar__actions">
            {sandbox ? (
              <>
                <button type="button" className="demo-bar__link" onClick={() => setMailOpen(true)}>
                  {t("demo.mailbox")}
                </button>
                <button type="button" className="demo-bar__link" onClick={() => setWelcomeOpen(true)}>
                  {t("demo.accountsAndCard")}
                </button>
                {confirmReset ? (
                  <span className="demo-bar__confirm">
                    {t("demo.resetConfirm")}
                    <button type="button" className="demo-bar__link demo-bar__link--strong" disabled={busy} onClick={reset}>
                      {busy ? t("demo.resetting") : t("demo.resetYes")}
                    </button>
                    <button type="button" className="demo-bar__link" onClick={() => setConfirmReset(false)}>
                      {t("common.cancel")}
                    </button>
                  </span>
                ) : (
                  <button type="button" className="demo-bar__link" onClick={() => setConfirmReset(true)}>
                    {t("demo.reset")}
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="demo-bar__cta" disabled={busy} onClick={openSandbox}>
                {busy ? t("demo.opening") : t("demo.open")}
              </button>
            )}
          </span>
            </>
          )}
        </div>
      </div>

      {welcomeOpen && (
        <div className="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-dialog-title" onClick={closeWelcome}>
          <div className="demo-dialog__card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="demo-dialog__close" aria-label={t("common.close")} onClick={closeWelcome}>
              ×
            </button>
            <span className="demo-bar__badge">{t("demo.badge")}</span>
            <h2 id="demo-dialog-title">{t("demo.welcomeTitle")}</h2>
            <p className="demo-dialog__lead">{t("demo.welcomeText", { hours: config.sandboxHours ?? 24 })}</p>

            {(config.accounts ?? []).length > 0 && (
              <div className="demo-accounts">
                {(config.accounts ?? []).map((account) => (
                  <div key={account.username} className="demo-account">
                    <div className="demo-account__role">{account.role === "admin" ? t("demo.roleAdmin") : t("demo.roleBuyer")}</div>
                    <div className="demo-account__row">
                      <span className="demo-account__label">{t("demo.login")}</span>
                      <code>{account.username}</code>
                      <CopyButton value={account.username} label={t("demo.login")} />
                    </div>
                    <div className="demo-account__row">
                      <span className="demo-account__label">{t("demo.password")}</span>
                      <code>{account.password}</code>
                      <CopyButton value={account.password} label={t("demo.password")} />
                    </div>
                    {sandbox && initialized && !keycloak.authenticated && (
                      <button type="button" className="btn btn-outline demo-account__signin" onClick={() => signIn(account)}>
                        {account.role === "admin" ? t("demo.signInAdmin") : t("demo.signInBuyer")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="demo-card-hint">
              <span>{t("demo.testCard")}</span>
              <code>{TEST_CARD}</code>
              <CopyButton value={TEST_CARD.replace(/ /g, "")} label={t("demo.testCard")} />
              <span className="demo-card-hint__note">{t("demo.testCardNote")}</span>
            </div>

            <div className="demo-dialog__actions">
              {sandbox ? (
                <button type="button" className="btn btn-primary" onClick={closeWelcome}>
                  {t("demo.continue")}
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={openSandbox}>
                    {busy ? t("demo.opening") : t("demo.open")}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={closeWelcome}>
                    {t("demo.justLook")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {mailOpen && <DemoMailbox onClose={() => setMailOpen(false)} />}
    </>
  );
};

/** Демо-почта: письма, которые сайт «отправил» из этой копии. Письмо показывается в изолированной рамке. */
const DemoMailbox: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, i18n } = useTranslation();
  const [letters, setLetters] = useState<DemoLetter[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    getDemoMailbox()
      .then((items) => {
        setLetters(items);
        setOpenId(items[0]?.id ?? null);
      })
      .catch(() => setLetters([]));
  }, []);

  const open = letters?.find((letter) => letter.id === openId) ?? null;

  return (
    <div className="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-mail-title" onClick={onClose}>
      <div className="demo-dialog__card demo-mail" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="demo-dialog__close" aria-label={t("common.close")} onClick={onClose}>
          ×
        </button>
        <h2 id="demo-mail-title">{t("demo.mailbox")}</h2>
        <p className="demo-dialog__lead">{t("demo.mailboxText")}</p>
        {letters === null ? (
          <p>{t("common.loading")}</p>
        ) : letters.length === 0 ? (
          <p className="demo-mail__empty">{t("demo.mailboxEmpty")}</p>
        ) : (
          <div className="demo-mail__layout">
            <ul className="demo-mail__list">
              {letters.map((letter) => (
                <li key={letter.id}>
                  <button
                    type="button"
                    className={`demo-mail__item${letter.id === openId ? " is-active" : ""}`}
                    onClick={() => setOpenId(letter.id)}
                  >
                    <span className="demo-mail__subject">{letter.subject}</span>
                    <span className="demo-mail__meta">
                      {letter.to} · {new Date(letter.sentAt).toLocaleString(i18n.language)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {open && (
              <div className="demo-mail__view">
                {open.html ? (
                  // Скрипты в письме не выполняются (нет allow-scripts). Тот же источник — чтобы грузились
                  // картинки сайта (логотип), ссылки открываются в новой вкладке: «Подтвердить», «Ключи» — работают.
                  <iframe
                    title={open.subject}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={`<base target="_blank">${open.html}`}
                    className="demo-mail__frame"
                  />
                ) : (
                  <pre className="demo-mail__text">{open.text}</pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DemoLayer;
