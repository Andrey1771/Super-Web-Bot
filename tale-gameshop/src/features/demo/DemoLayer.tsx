import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useKeycloak } from "@react-keycloak/web";
import { useToast } from "../../components/ui/ToastProvider";
import { currentLang } from "../../context/site-preferences";
import { DEMO_EVENT, type DemoAccount, type DemoConfig, type DemoRefusalCode } from "./demoApi";
import DemoCredentials from "./DemoCredentials";
import { loadDemoConfig } from "./useDemoConfig";
import "./demo-layer.css";

/** Сколько кружок «Демо» пульсирует после появления: заметить успевают, а на видео и в работе он уже не мешает. */
const PULSE_MS = 8000;
/** Подсказка у кружка «здесь всё для демо» — один раз на браузер и ненадолго. */
const HINT_MS = 9000;
const HINT_SEEN_KEY = "demo-fab-hint-seen";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Демо-сайт для портфолио: окно приглашения при первом заходе, после закрытия оно «улетает» в кружок «Демо»
 * в левом нижнем углу. Кружок есть на всех страницах; по нажатию — панель: зарегистрироваться и купить тестовой
 * картой, войти демо-админом («только просмотр»). На обычном магазине слой ничего не рисует.
 */
const DemoLayer: React.FC = () => {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { keycloak, initialized } = useKeycloak();
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const startPulse = useCallback(() => {
    setPulse(true);
    window.setTimeout(() => setPulse(false), PULSE_MS);
    // Первый раз в этом браузере — ещё и подпись рядом с кружком: что в нём лежит.
    let seen = true;
    try {
      seen = localStorage.getItem(HINT_SEEN_KEY) === "1";
      localStorage.setItem(HINT_SEEN_KEY, "1");
    } catch {
      /* storage unavailable — подсказку не показываем, чтобы не всплывала на каждой странице */
    }
    if (!seen) {
      setHintOpen(true);
      window.setTimeout(() => setHintOpen(false), HINT_MS);
    }
  }, []);

  useEffect(() => {
    loadDemoConfig().then((value) => {
      setConfig(value);
      if (!value.enabled) return;
      // Первый заход в этой вкладке — сразу объясняем, что это за сайт; дальше просто показываем кружок.
      let seen = false;
      try {
        seen = sessionStorage.getItem("demo-welcome-seen") === "1";
      } catch {
        /* storage unavailable */
      }
      if (!seen) {
        setWelcomeOpen(true);
      } else {
        startPulse();
      }
    });
  }, [startPulse]);

  // Демо-админ — «только просмотр»: на отказ сервера (см. demoEvents) показываем пояснение, а не голую ошибку.
  useEffect(() => {
    const onRefusal = (event: Event) => {
      const code = (event as CustomEvent<{ code: DemoRefusalCode }>).detail?.code;
      if (code === "demo_readonly") {
        addToast(t("demo.readonly"), "info");
      }
    };
    window.addEventListener(DEMO_EVENT, onRefusal);
    return () => window.removeEventListener(DEMO_EVENT, onRefusal);
  }, [addToast, t]);

  // Панель закрывается кликом мимо неё и клавишей Esc.
  useEffect(() => {
    if (!panelOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !fabRef.current?.contains(target)) {
        setPanelOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanelOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  if (!config?.enabled) {
    return null;
  }

  const accounts = config.accounts ?? [];

  /** Окно не просто исчезает, а «улетает» в кружок — чтобы было видно, где теперь искать аккаунты и карту. */
  const closeWelcome = () => {
    try {
      sessionStorage.setItem("demo-welcome-seen", "1");
    } catch {
      /* storage unavailable */
    }
    const card = cardRef.current;
    const fab = fabRef.current;
    if (!card || !fab || prefersReducedMotion() || typeof card.animate !== "function") {
      setWelcomeOpen(false);
      startPulse();
      return;
    }
    const from = card.getBoundingClientRect();
    const to = fab.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = to.width / from.width;
    const animation = card.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1, borderRadius: "16px" },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0, borderRadius: "50%" },
      ],
      { duration: 480, easing: "cubic-bezier(0.55, 0, 0.3, 1)", fill: "forwards" }
    );
    card.parentElement?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, fill: "forwards" });
    // Закрываем и по таймеру: Safari на iPhone иногда не присылает onfinish (браузер свернули посреди полёта),
    // и окно оставалось у кружка белым кругом. К концу полёта окно гаснет полностью — даже застряв, его не видно.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setWelcomeOpen(false);
      startPulse();
    };
    animation.onfinish = finish;
    window.setTimeout(finish, 700);
  };

  const signedOut = initialized && !keycloak.authenticated;
  // Вход демо-админом: страница входа уже знает логин (loginHint), а кнопка там подставляет и пароль.
  const signIn = signedOut
    ? (account: DemoAccount) => keycloak.login({ loginHint: account.username, redirectUri: window.location.href, locale: currentLang() })
    : undefined;
  // Свой аккаунт посетителя — сразу на регистрацию Keycloak, и обратно на ту же страницу.
  const register = () => keycloak.register({ redirectUri: window.location.href, locale: currentLang() });

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`demo-fab${pulse ? " is-pulsing" : ""}${panelOpen ? " is-open" : ""}`}
        aria-expanded={panelOpen}
        aria-label={t("demo.fabLabel")}
        title={t("demo.fabLabel")}
        onClick={() => {
          setPulse(false);
          setHintOpen(false);
          setPanelOpen((value) => !value);
        }}
      >
        <span className="demo-fab__rays" aria-hidden="true" />
        <span className="demo-fab__text">{t("demo.badge")}</span>
      </button>

      {hintOpen && !panelOpen && (
        <div className="demo-fab-hint" role="status">
          <button
            type="button"
            className="demo-fab-hint__body"
            onClick={() => {
              setHintOpen(false);
              setPanelOpen(true);
            }}
          >
            {t("demo.fabHint")}
          </button>
          <button type="button" className="demo-fab-hint__close" aria-label={t("common.close")} onClick={() => setHintOpen(false)}>
            ×
          </button>
        </div>
      )}

      {panelOpen && (
        <div ref={panelRef} className="demo-panel" role="dialog" aria-label={t("demo.panelTitle")}>
          <div className="demo-panel__head">
            <span className="demo-badge">{t("demo.badge")}</span>
            <strong>{t("demo.panelTitle")}</strong>
          </div>
          <p className="demo-panel__status">{t("demo.panelText")}</p>

          <DemoCredentials accounts={accounts} onSignIn={signIn} />

          <div className="demo-panel__actions">
            {signedOut && (
              <button type="button" className="btn btn-primary" onClick={register}>
                {t("demo.register")}
              </button>
            )}
            <button type="button" className="demo-panel__link" onClick={() => { setPanelOpen(false); setWelcomeOpen(true); }}>
              {t("demo.whatIsThis")}
            </button>
          </div>
        </div>
      )}

      {welcomeOpen && (
        <div className="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-dialog-title" onClick={closeWelcome}>
          <div ref={cardRef} className="demo-dialog__card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="demo-dialog__close" aria-label={t("common.close")} onClick={closeWelcome}>
              ×
            </button>
            <span className="demo-badge">{t("demo.badge")}</span>
            <h2 id="demo-dialog-title">{t("demo.welcomeTitle")}</h2>
            <p className="demo-dialog__lead">{t("demo.welcomeText")}</p>

            <DemoCredentials accounts={accounts} onSignIn={signIn} />

            <div className="demo-dialog__actions">
              {signedOut ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={register}>
                    {t("demo.register")}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={closeWelcome}>
                    {t("demo.justLook")}
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" onClick={closeWelcome}>
                  {t("demo.continue")}
                </button>
              )}
            </div>
            <p className="demo-dialog__footnote">{t("demo.findLater")}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default DemoLayer;
