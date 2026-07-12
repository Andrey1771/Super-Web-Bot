import React, { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Cloudflare Turnstile global (loaded from their script).
type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      size?: "normal" | "flexible" | "compact";
      appearance?: "always" | "execute" | "interaction-only";
    }
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

const loadTurnstileScript = (): Promise<void> => {
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(script);
  });
  return scriptPromise;
};

type TurnstileWidgetProps = {
  siteKey: string;
  onToken: (token: string) => void;
  labels: { error: string; retry: string };
};

const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({ siteKey, onToken, labels }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [errored, setErrored] = useState(false);
  const [solved, setSolved] = useState(false);

  const removeWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        /* already removed */
      }
      widgetIdRef.current = null;
    }
  }, []);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) {
      return;
    }
    removeWidget();
    setErrored(false);
    setSolved(false);
    // Swap Cloudflare's raw error/expired UI for our own compact, on-brand state,
    // and hide the widget entirely once it has passed.
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      size: "flexible",
      callback: (token) => {
        setErrored(false);
        setSolved(true);
        onToken(token);
      },
      "expired-callback": () => {
        setSolved(false);
        setErrored(true);
      },
      "error-callback": () => setErrored(true),
    });
  }, [siteKey, onToken, removeWidget]);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (!cancelled) {
          renderWidget();
        }
      })
      .catch(() => {
        // Script blocked/unavailable — backend fails open, so the chat still works.
      });

    return () => {
      cancelled = true;
      removeWidget();
    };
  }, [renderWidget, removeWidget]);

  const handleRetry = () => {
    removeWidget();
    renderWidget();
  };

  const hidden = solved || errored;

  return (
    <div className="support-chat__turnstile" style={hidden ? { margin: 0 } : undefined}>
      {/* Kept mounted (so expiry can re-show the check); hidden once solved or errored. */}
      <div ref={containerRef} style={hidden ? { display: "none" } : undefined} />
      {errored && !solved && (
        <div className="support-chat__turnstile-error">
          <span>{labels.error}</span>
          <button type="button" className="btn btn-outline" onClick={handleRetry}>
            {labels.retry}
          </button>
        </div>
      )}
    </div>
  );
};

export default TurnstileWidget;
