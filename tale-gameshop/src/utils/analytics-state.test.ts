import { isAnalyticsAvailable, shouldShowCookieBanner } from "./analytics-state";

describe("analytics-state", () => {
  it("returns false when analytics is disabled", () => {
    expect(isAnalyticsAvailable({ isEnabled: false })).toBe(false);
  });

  it("returns false when enabled but provider ids are empty", () => {
    expect(
      isAnalyticsAvailable({
        isEnabled: true,
        gaMeasurementId: "",
        gtmContainerId: "   ",
        yandexCounterId: "",
      }),
    ).toBe(false);
  });

  it("returns true when at least one provider id is configured", () => {
    expect(isAnalyticsAvailable({ isEnabled: true, gaMeasurementId: "G-TEST" })).toBe(true);
  });

  it("shows banner only on storefront when settings loaded and consent missing", () => {
    const settings = { isEnabled: true, yandexCounterId: "123" };

    expect(shouldShowCookieBanner(false, true, settings, null)).toBe(true);
    expect(shouldShowCookieBanner(true, true, settings, null)).toBe(false);
    expect(shouldShowCookieBanner(false, false, settings, null)).toBe(false);
    expect(shouldShowCookieBanner(false, true, settings, false)).toBe(false);
  });
});
