import { analyticsClient } from "./analytics-client";

/**
 * Команды, которые реально ушли в очередь счётчика.
 *
 * Читаем dataLayer, а не заглушку window.gtag: загрузив gtag.js, клиент ставит туда свою
 * функцию, и вызовы заглушки после этого ничего не значат. Записи там — объекты arguments
 * (только их gtag.js и признаёт командами), поэтому приводим каждую к массиву.
 */
const pageViewCommands = (): unknown[][] =>
  ((window as any).dataLayer as ArrayLike<unknown>[])
    .filter((entry) => entry != null && typeof (entry as ArrayLike<unknown>).length === "number")
    .map((entry) => Array.from(entry))
    .filter((args) => args[0] === "event" && args[1] === "page_view");

describe("analytics-client", () => {
  const originalAppendChild = document.head.appendChild.bind(document.head);

  beforeEach(() => {
    analyticsClient.resetForTests();
    (window as any).gtag = jest.fn();
    (window as any).ym = jest.fn();
    (window as any).dataLayer = [];

    jest.spyOn(document.head, "appendChild").mockImplementation(((node: Node) => {
      const element = node as HTMLScriptElement;
      setTimeout(() => element.onload?.(new Event("load")), 0);
      return originalAppendChild(node);
    }) as typeof document.head.appendChild);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.querySelectorAll("#ga4-script,#gtm-script,#ym-script").forEach((el) => el.remove());
  });

  it("does not load scripts when consent is rejected", async () => {
    analyticsClient.configure({ isEnabled: true, gaMeasurementId: "G-TEST" });
    analyticsClient.setConsent(false);
    analyticsClient.trackPageView("/games");

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(document.getElementById("ga4-script")).toBeNull();
    expect(pageViewCommands()).toHaveLength(0);
  });

  it("loads script and tracks first page view once after consent", async () => {
    analyticsClient.configure({ isEnabled: true, gaMeasurementId: "G-TEST" });
    analyticsClient.trackPageView("/before-consent");

    analyticsClient.setConsent(true);
    analyticsClient.trackPageView("/after-consent");

    await new Promise((resolve) => setTimeout(resolve, 20));

    const pageViewCalls = pageViewCommands();

    expect(document.getElementById("ga4-script")).not.toBeNull();
    expect(pageViewCalls).toHaveLength(1);
    expect(pageViewCalls[0][2]).toMatchObject({ page_path: "/after-consent" });

    // Форма записи важна не меньше содержания: gtag.js признаёт командой только объект
    // arguments. Массив он молча пропускает — счётчик грузится, очередь наполняется,
    // ошибок нет, а до Google не уходит ни события, ни самой конфигурации.
    const commands = (window as any).dataLayer as unknown[];
    expect(commands.some((entry) => Array.isArray(entry))).toBe(false);
    expect(Object.prototype.toString.call(commands[0])).toBe("[object Arguments]");
  });

  // Порядок как у повторного визита: согласие сохранено с прошлого раза, страница уже
  // открыта, а настройки счётчика ещё едут с сервера. Просмотр посадочной страницы
  // терялся именно здесь — и визит без переходов не попадал в статистику вообще.
  it("sends the landing page view when settings arrive after it", async () => {
    analyticsClient.setConsent(true);
    analyticsClient.trackPageView("/games");
    analyticsClient.configure({ isEnabled: true, gaMeasurementId: "G-TEST" });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const pageViewCalls = pageViewCommands();

    expect(pageViewCalls).toHaveLength(1);
    expect(pageViewCalls[0][2]).toMatchObject({ page_path: "/games" });
  });
});
