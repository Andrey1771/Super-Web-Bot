import { analyticsClient } from "./analytics-client";

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
    expect((window as any).gtag).not.toHaveBeenCalledWith("event", "page_view", expect.anything());
  });

  it("loads script and tracks first page view once after consent", async () => {
    analyticsClient.configure({ isEnabled: true, gaMeasurementId: "G-TEST" });
    analyticsClient.trackPageView("/before-consent");

    analyticsClient.setConsent(true);
    analyticsClient.trackPageView("/after-consent");

    await new Promise((resolve) => setTimeout(resolve, 20));

    const pageViewCalls = (window as any).gtag.mock.calls.filter(
      (args: unknown[]) => Array.isArray(args) && args[0] === "event" && args[1] === "page_view",
    );

    expect(document.getElementById("ga4-script")).not.toBeNull();
    expect(pageViewCalls).toHaveLength(1);
    expect(pageViewCalls[0][2]).toMatchObject({ page_path: "/after-consent" });
  });
});
