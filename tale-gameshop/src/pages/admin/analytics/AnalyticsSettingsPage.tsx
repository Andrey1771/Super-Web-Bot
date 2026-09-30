import React, { useEffect, useState } from "react";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import StickySaveBar from "../../../components/ui/StickySaveBar";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IAdminAnalyticsService } from "../../../iterfaces/i-admin-analytics-service";
import type { AnalyticsConnectionStatus, AnalyticsSettings } from "../../../types/analytics";

/** Короткая подпись состояния рядом с кнопкой. Служебные коды наружу не показываем. */
const STATUS_LABEL: Record<string, string> = {
  connected: "connected",
  not_configured: "not connected",
  token_rejected: "token no longer accepted",
  error: "error",
};

/** Сколько дней живёт токен, пока приложение в Cloud Console числится черновиком. */
const TESTING_TOKEN_DAYS = 7;

const AnalyticsSettingsPage: React.FC = () => {
  const adminAnalyticsService = container.get<IAdminAnalyticsService>(IDENTIFIERS.IAdminAnalyticsService);
  const { addToast } = useToast();
  const { setPageTitle } = useAdminHeader();

  const [settings, setSettings] = useState<AnalyticsSettings>({
    gaMeasurementId: "",
    gaPropertyId: "",
    gtmContainerId: "",
    isEnabled: false,
  });
  // Снимок того, что реально лежит на сервере. Без него нельзя ответить на главный вопрос
  // этой страницы: галочка уже действует или её ещё надо сохранить.
  const [saved, setSaved] = useState<AnalyticsSettings>({ isEnabled: false });
  const [status, setStatus] = useState<AnalyticsConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPageTitle("Analytics settings");
  }, [setPageTitle]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await adminAnalyticsService.getSettings();
        setSettings(response);
        setSaved(response);
        const connectionStatus = await adminAnalyticsService.getConnectionStatus();
        setStatus(connectionStatus);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [adminAnalyticsService]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await adminAnalyticsService.updateSettings(settings);
      setSettings(response);
      setSaved(response);
      // Статус мог измениться ровно сейчас — например, включили аналитику или поправили
      // Property ID. Перечитываем сами: просить об этом человека отдельной кнопкой значит
      // держать на экране элемент, который умеет показывать устаревшее.
      setStatus(await adminAnalyticsService.getConnectionStatus());
      addToast(
        response.isEnabled
          ? "Saved. Analytics is on: visitors now see the cookie banner."
          : "Saved. Analytics is off: nothing is sent to Google.",
        "success",
      );
    } catch (error) {
      console.error(error);
      addToast("Failed to save analytics settings", "error");
    } finally {
      setSaving(false);
    }
  };


  // Есть ли несохранённые правки. Введённый секрет считается правкой всегда: сравнивать его
  // не с чем — с сервера приходит только маска.
  const dirty =
    settings.isEnabled !== saved.isEnabled ||
    (settings.gaMeasurementId ?? "") !== (saved.gaMeasurementId ?? "") ||
    (settings.gaPropertyId ?? "") !== (saved.gaPropertyId ?? "") ||
    (settings.gtmContainerId ?? "") !== (saved.gtmContainerId ?? "") ||
    (settings.gaOauthClientId ?? "") !== (saved.gaOauthClientId ?? "") ||
    Boolean(settings.gaApiSecret?.trim()) ||
    Boolean(settings.gaOauthClientSecret?.trim()) ||
    Boolean(settings.gaOauthRefreshToken?.trim());

  const togglePending = settings.isEnabled !== saved.isEnabled;

  return (
    <div className="admin-grid">
      <PageHeader
        title="Analytics settings"
        description="Configure GA4 and GTM to track storefront performance."
        breadcrumbs={["System", "Tracking"]}
      />

      <Card>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Enable analytics</label>
          <input
            type="checkbox"
            checked={settings.isEnabled}
            onChange={(event) => setSettings((prev) => ({ ...prev, isEnabled: event.target.checked }))}
          />
          {/* Галочка сама по себе ничего не включает. Пока это не сказано вслух, единственный
              способ узнать — уйти со страницы и вернуться. */}
          {togglePending && (
            <span className="text-xs text-amber-600">not saved yet — press Save below</span>
          )}
        </div>

        <p className="text-xs text-slate-500 mt-2">
          The master switch for Google Analytics. With it off the storefront never loads the Google
          tag, never shows the cookie banner, and never sends purchases to GA. The shop&apos;s own
          reports — funnel, channels, abandoned carts, margin — are counted from orders and do not
          depend on this switch.
        </p>

        {/* Обе стороны переключения меняют то, что видит покупатель, поэтому предупреждаем до
            сохранения, а не после. */}
        {togglePending && (
          <p className="text-xs text-slate-500 mt-2">
            {settings.isEnabled
              ? "On save: visitors start seeing the cookie banner, and the Google tag loads for those who accept. Nothing reaches Google before someone accepts."
              : "On save: the Google tag stops loading, the cookie banner disappears and purchases are no longer sent to GA. Data already collected stays in your GA property."}
          </p>
        )}
      </Card>

      <Card>
        <div className="admin-grid">
          <div>
            <h3>Google Analytics 4</h3>
            <p className="muted text-sm">Measurement ID format: G-XXXXXXX</p>
            <div className="mt-4 stack-y-3">
              <label className="block text-sm">Measurement ID</label>
              <input
                className="input w-full"
                value={settings.gaMeasurementId ?? ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, gaMeasurementId: event.target.value }))}
              />
              <label className="block text-sm">Property ID</label>
              <input
                className="input w-full"
                value={settings.gaPropertyId ?? ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, gaPropertyId: event.target.value }))}
              />
              {/* Ссылка на сам ресурс в Google: заодно это проверка, что Property ID введён
                  верно — если откроется чужой или пустой ресурс, значит номер не тот. */}
              {saved.gaPropertyId && (
                <p className="text-xs text-slate-500">
                  <a
                    href={`https://analytics.google.com/analytics/web/#/p${saved.gaPropertyId}/reports/intelligenthome`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open this property in Google Analytics
                  </a>
                </p>
              )}
              {/* Секрет Measurement Protocol: им сервер сам отправляет покупку в GA — без
                  браузера, а значит и без потерь на блокировщиках. Наружу ключ не отдаётся,
                  поэтому поле всегда пустое: пустым его и оставляют, если менять не нужно. */}
              <label className="block text-sm">
                Measurement Protocol API secret
              </label>
              {/* Сохранённый ключ показывается подсказкой ВНУТРИ поля, а не значением: подсказка
                  не отправляется на сервер, и её невозможно случайно сохранить вместо ключа.
                  Пустое поле = «не менять», поэтому набранное здесь всегда означает новый ключ. */}
              <input
                className="input w-full"
                type="password"
                autoComplete="off"
                placeholder={settings.gaApiSecretHint ?? "GA → Admin → Data Streams → Measurement Protocol"}
                value={settings.gaApiSecret ?? ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, gaApiSecret: event.target.value }))}
              />
              <p className="text-xs text-slate-500">
                {settings.hasGaApiSecret
                  ? "A secret is saved — the field shows its first and last characters. Leave it empty to keep that one, or type a new secret to replace it."
                  : "Without it the storefront still tracks visits, but purchases are only sent from the browser — and there they are lost to ad blockers."}
              </p>
              <label className="block text-sm">GTM Container ID (optional)</label>
              <input
                className="input w-full"
                value={settings.gtmContainerId ?? ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, gtmContainerId: event.target.value }))}
              />
              {/* Состояние читается при открытии страницы и после сохранения — то есть в оба
                  момента, когда оно вообще может измениться. Кнопки «проверить» здесь нет
                  намеренно: она умела показывать результат для сохранённых значений, пока на
                  экране лежали несохранённые. */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">GA reports:</span>
                <span className={`text-xs ${status?.ga4 === "connected" ? "text-green-600" : "text-slate-500"}`}>
                  {status?.ga4 ? STATUS_LABEL[status.ga4] ?? status.ga4 : "not checked"}
                </span>
              </div>
            </div>
          </div>

        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="btn btn-primary" onClick={handleSave} disabled={loading || saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Card>

      {/* Состояние доступа к чтению отчётов. Раньше здесь висела статичная памятка «ключи должны
          лежать на сервере» — она не отвечала на единственный возникающий вопрос: лежат или нет.
          Сервер это знает, поэтому здесь он и отвечает, называя недостающие переменные поимённо.
          Значения переменных не показываются — только их имена. */}
      <Card>
        <h3>Report access</h3>
        <p className="text-sm text-slate-600 mt-2">
          The fields above let the shop <strong>send</strong> data to Google — that is all the storefront
          needs. <strong>Reading</strong> those reports back into this panel is a different thing: Google
          grants it to a program of its own, created in Google Cloud Console rather than in Analytics.
          Its three parts go below. They only ever read analytics — nothing else in your Google account.
        </p>

        <div className="mt-4 stack-y-3">
          <label className="block text-sm">Client ID</label>
          <input
            className="input w-full"
            autoComplete="off"
            placeholder="…apps.googleusercontent.com"
            value={settings.gaOauthClientId ?? ""}
            onChange={(event) => setSettings((prev) => ({ ...prev, gaOauthClientId: event.target.value }))}
          />

          {/* Два оставшихся — секреты, поэтому по тому же правилу, что и Measurement Protocol:
              поле пустое, сохранённое видно огрызком в подсказке, пустое значит «не менять». */}
          <label className="block text-sm">Client secret</label>
          <input
            className="input w-full"
            type="password"
            autoComplete="off"
            placeholder={settings.gaOauthClientSecretHint ?? "from the same screen as the Client ID"}
            value={settings.gaOauthClientSecret ?? ""}
            onChange={(event) => setSettings((prev) => ({ ...prev, gaOauthClientSecret: event.target.value }))}
          />

          <label className="block text-sm">Refresh token</label>
          <input
            className="input w-full"
            type="password"
            autoComplete="off"
            placeholder={settings.gaOauthRefreshTokenHint ?? "from the OAuth Playground exchange"}
            value={settings.gaOauthRefreshToken ?? ""}
            onChange={(event) => setSettings((prev) => ({ ...prev, gaOauthRefreshToken: event.target.value }))}
          />

          <p className="text-xs text-slate-500">
            {settings.hasGaOauthClientSecret || settings.hasGaOauthRefreshToken
              ? "Saved secrets show their first and last characters. Leave a field empty to keep what is stored."
              : "Stored with the shop, used only to read your Analytics reports, and revocable at any time in your Google account."}
          </p>
        </div>

        {/* Слова Google показываются только тогда, когда он действительно отказал. Придумывать
            причину за него нельзя: «нет прав на ресурс» и «истёк токен» чинятся по-разному. */}
        {status?.ga4 === "token_rejected" && (
          <div className="mt-3 text-sm" style={{ color: "#b45309" }}>
            <p>
              <strong>Google no longer accepts the refresh token.</strong>{" "}
              {status.ga4Detail ?? "It was either revoked or has expired."}
            </p>
            <p className="mt-1">
              Get a new one (step 6 below) and save it here. If the Cloud Console app is still in
              Testing, publish it first — otherwise the next token expires in {TESTING_TOKEN_DAYS} days too.
            </p>
          </div>
        )}

        {status?.ga4 === "error" && status.ga4Detail && (
          <p className="mt-3 text-sm" style={{ color: "#b45309" }}>
            <strong>Google refused the request:</strong> {status.ga4Detail}
          </p>
        )}

        {/* Напоминание о недельном сроке — только пока доступ работает и токен свежий.
            Показывать его при неработающем доступе бессмысленно: там уже другая беда. */}
        {status?.ga4 === "connected" && status.refreshTokenSavedAtUtc && (
          <p className="text-sm text-slate-500 mt-3">
            Refresh token saved on {new Date(status.refreshTokenSavedAtUtc).toLocaleDateString()}. If the
            Cloud Console app is still in Testing, Google stops accepting it around{" "}
            {new Date(
              new Date(status.refreshTokenSavedAtUtc).getTime() + TESTING_TOKEN_DAYS * 86400000,
            ).toLocaleDateString()}
            . Publishing the app removes that limit for good.
          </p>
        )}

        {status?.reportAccess === undefined ? (
          <p className="text-sm text-slate-500 mt-3">Checking…</p>
        ) : status.reportAccess.configured ? (
          status.ga4 === "connected" ? (
            <p className="text-sm text-green-600 mt-3">Access is in place — reports load in this panel.</p>
          ) : null
        ) : (
          <>
            <p className="text-sm text-slate-600 mt-3">
              {status.reportAccess.missing.length === 3
                ? "Not set up yet. Nothing is missing from the fields above the card — these three are their own thing:"
                : "Partly set up. Still missing:"}
            </p>
            <ul className="list-disc ml-5 mt-2 text-sm text-slate-600">
              {status.reportAccess.missing.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p className="text-sm text-slate-500 mt-2">
              Until then the reports live on the Google Analytics site itself. Collecting data is not affected.
            </p>

            {/* Инструкция лежит здесь, а не в переписке и не в файле окружения: вопрос «откуда
                их взять» возникает ровно на этом экране. Те же шаги продублированы в .env.example
                — там их ищет тот, кто разворачивает сервер. */}
            <details className="mt-3">
              <summary className="text-sm text-slate-600 cursor-pointer">How to get these (about 15 minutes)</summary>
              <ol className="list-decimal ml-5 mt-2 text-sm text-slate-600 stack-y-1">
                <li>
                  Open <code>console.cloud.google.com</code> and create a project — any name. This is Google
                  Cloud, not Analytics.
                </li>
                <li>Search for <strong>Google Analytics Data API</strong> and enable it.</li>
                <li>
                  APIs &amp; Services → OAuth consent screen → <strong>External</strong>. Fill in the name and
                  your e-mail, then add that same e-mail under <em>Test users</em>.
                </li>
                {/* Google сам гасит refresh token через семь дней, пока приложение числится
                    в статусе Testing. Об этом нигде не предупреждают заранее — доступ просто
                    отваливается через неделю, и выглядит это как поломка на нашей стороне. */}
                <li>
                  On that same screen press <strong>Publish app</strong>. While the app stays in
                  <em> Testing</em>, Google expires the refresh token after <strong>7 days</strong> and the
                  reports stop loading. Publishing removes that limit. Verification is not required — you
                  will just see an "unverified app" warning when signing in at step 5; continue past it.
                </li>
                <li>
                  APIs &amp; Services → Credentials → Create credentials → <strong>OAuth client ID</strong> →
                  Web application. Add <code>https://developers.google.com/oauthplayground</code> as an
                  authorised redirect URI. Google then shows the <strong>Client ID</strong> and
                  <strong> Client Secret</strong>.
                </li>
                <li>
                  Open <code>developers.google.com/oauthplayground</code> → gear icon → tick
                  <em> Use your own OAuth credentials</em> → paste the ID and secret. In the API list pick
                  <strong> Google Analytics Data API v1</strong> →
                  <code> .../auth/analytics.readonly</code> → Authorize APIs → sign in → Exchange
                  authorization code for tokens. The response contains the <strong>refresh token</strong>.
                </li>
                <li>
                  Paste all three into the fields above and press Save. No restart, no files — the card
                  turns green on its own. (A server that is deployed without ever opening this panel can
                  still set <code>GA_OAUTH_CLIENT_ID</code>, <code>GA_OAUTH_CLIENT_SECRET</code> and
                  <code> GA_OAUTH_REFRESH_TOKEN</code> in its environment instead; what is saved here wins.)
                </li>
              </ol>
            </details>
          </>
        )}
      </Card>

      {/* Кнопка Save живёт внизу второй карточки, а переключатель — в первой. Без этой полосы
          правку в одной карточке легко принять за уже применённую. */}
      <StickySaveBar
        isVisible={dirty}
        isSaving={saving}
        onSave={handleSave}
        onCancel={() => setSettings(saved)}
      />
    </div>
  );
};

export default AnalyticsSettingsPage;
