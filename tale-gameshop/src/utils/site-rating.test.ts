import { buildSiteRatingView, formatAverage, formatReviewCount, MIN_REVIEWS_FOR_RATING } from "./site-rating";
import type { SiteReviewSummary } from "../api/reviewsApi";

const summary = (over: Partial<SiteReviewSummary> = {}): SiteReviewSummary => ({
  average: 0,
  count: 0,
  distribution: {},
  quotes: [],
  ...over,
});

describe("buildSiteRatingView", () => {
  it("отзывов нет — пустое состояние, а не нулевая оценка", () => {
    expect(buildSiteRatingView(summary())).toEqual({ state: "empty" });
  });

  it("отзывов меньше порога — среднее не показываем", () => {
    const view = buildSiteRatingView(summary({ count: MIN_REVIEWS_FOR_RATING - 1, average: 5 }));
    expect(view).toEqual({ state: "too-few", count: MIN_REVIEWS_FOR_RATING - 1 });
  });

  it("ровно на пороге оценка уже показывается", () => {
    const view = buildSiteRatingView(
      summary({ count: MIN_REVIEWS_FOR_RATING, average: 4, distribution: { "4": MIN_REVIEWS_FOR_RATING } })
    );
    expect(view.state).toBe("ready");
  });

  it("считает заливку звёзд по средней оценке", () => {
    const view = buildSiteRatingView(summary({ count: 40, average: 4.6, distribution: { "5": 40 } }));
    expect(view.state === "ready" && view.starsPercent).toBe(92);
  });

  it("оценки без единого отзыва всё равно попадают в разбивку с нулём", () => {
    const view = buildSiteRatingView(summary({ count: 30, average: 4.5, distribution: { "5": 15, "4": 15 } }));
    if (view.state !== "ready") throw new Error("ожидалось ready");
    expect(view.rows.map((row) => row.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(view.rows.map((row) => row.count)).toEqual([15, 15, 0, 0, 0]);
  });

  it("проценты в разбивке всегда дают ровно 100", () => {
    // 1/3 каждому: наивное округление дало бы 33+33+33 = 99.
    const view = buildSiteRatingView(summary({ count: 30, average: 4, distribution: { "5": 10, "4": 10, "3": 10 } }));
    if (view.state !== "ready") throw new Error("ожидалось ready");
    expect(view.rows.reduce((sum, row) => sum + row.percent, 0)).toBe(100);
  });

  it("проценты дают 100 и на неровных долях", () => {
    const view = buildSiteRatingView(
      summary({ count: 61, average: 4.15, distribution: { "5": 23, "4": 26, "3": 10, "2": 2 } })
    );
    if (view.state !== "ready") throw new Error("ожидалось ready");
    expect(view.rows.reduce((sum, row) => sum + row.percent, 0)).toBe(100);
    expect(view.rows.find((row) => row.stars === 1)?.percent).toBe(0);
  });

  it("ширина полосы идёт по неокруглённой доле", () => {
    const view = buildSiteRatingView(summary({ count: 30, average: 4, distribution: { "5": 10, "4": 20 } }));
    if (view.state !== "ready") throw new Error("ожидалось ready");
    const five = view.rows.find((row) => row.stars === 5);
    expect(five?.exactPercent).toBeCloseTo(33.333, 2);
  });

  it("среднее выше пяти или ниже нуля обрезается", () => {
    const high = buildSiteRatingView(summary({ count: 25, average: 7, distribution: { "5": 25 } }));
    expect(high.state === "ready" && high.starsPercent).toBe(100);
    const low = buildSiteRatingView(summary({ count: 25, average: -1, distribution: { "1": 25 } }));
    expect(low.state === "ready" && low.starsPercent).toBe(0);
  });
});

describe("форматирование", () => {
  it("округляет среднее до одного знака", () => {
    expect(formatAverage(4.147540983606557)).toBe("4.1");
    expect(formatAverage(5)).toBe("5.0");
  });

  it("разделяет разряды в количестве", () => {
    expect(formatReviewCount(2300)).toBe("2,300");
    expect(formatReviewCount(61)).toBe("61");
  });
});
