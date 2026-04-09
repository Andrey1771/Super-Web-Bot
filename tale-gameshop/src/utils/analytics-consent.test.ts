import {
  clearAnalyticsConsent,
  getAnalyticsConsent,
  hasSavedAnalyticsConsent,
  setAnalyticsConsent,
} from "./analytics-consent";

describe("analytics-consent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null consent when nothing is saved", () => {
    expect(getAnalyticsConsent()).toEqual({ analytics: null });
    expect(hasSavedAnalyticsConsent()).toBe(false);
  });

  it("persists and restores consent", () => {
    setAnalyticsConsent(true);

    expect(getAnalyticsConsent()).toEqual({ analytics: true });
    expect(hasSavedAnalyticsConsent()).toBe(true);
  });

  it("handles invalid json in localStorage", () => {
    localStorage.setItem("analytics-consent", "{bad-json");

    expect(getAnalyticsConsent()).toEqual({ analytics: null });
    expect(hasSavedAnalyticsConsent()).toBe(false);
  });

  it("clears consent", () => {
    setAnalyticsConsent(false);
    clearAnalyticsConsent();

    expect(getAnalyticsConsent()).toEqual({ analytics: null });
  });
});
