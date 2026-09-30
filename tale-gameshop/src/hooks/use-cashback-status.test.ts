import { CashbackEntry, isCashbackDemo, summarizeCashback } from "./use-cashback-status";

const entry = (over: Partial<CashbackEntry>): CashbackEntry => ({
    id: Math.random().toString(36),
    type: "earn",
    orderCurrency: "USD",
    orderNumber: "TS-1",
    gameTitle: "Game",
    imagePath: null,
    date: "2026-09-01",
    orderTotal: 50,
    percent: 5,
    amount: 2.5,
    status: "available",
    ...over,
});

it("доступно — начисленное и разблокированное минус потраченное", () => {
    const summary = summarizeCashback([
        entry({ amount: 3 }),
        entry({ amount: 2 }),
        entry({ amount: -4, percent: null, status: "spent" }),
    ]);
    expect(summary.available).toBe(1);
    expect(summary.usedAllTime).toBe(4);
    expect(summary.earnedAllTime).toBe(5);
});

it("возвращённый заказ не входит ни в начисленное, ни в сумму покупок", () => {
    const summary = summarizeCashback([
        entry({ orderTotal: 100, amount: 5 }),
        entry({ orderTotal: 40, amount: 2, status: "reverted" }),
    ]);
    expect(summary.earnedAllTime).toBe(5);
    expect(summary.totalSpent).toBe(100);
});

it("списание не считает заказ в сумме покупок второй раз", () => {
    const summary = summarizeCashback([
        entry({ orderNumber: "TS-9", orderTotal: 25, amount: 1.25 }),
        entry({ orderNumber: "TS-9", orderTotal: 25, amount: -5, percent: null, status: "spent" }),
    ]);
    expect(summary.totalSpent).toBe(25);
});

it("pending отдельно от доступного и с ближайшей датой разблокировки", () => {
    const summary = summarizeCashback([
        entry({ amount: 1, status: "pending", unlocksAt: "2026-09-30" }),
        entry({ amount: 2, status: "pending", unlocksAt: "2026-09-20" }),
        entry({ amount: 4 }),
    ]);
    expect(summary.pending).toBe(3);
    expect(summary.available).toBe(4);
    expect(summary.nextUnlockAt).toBe("2026-09-20");
});

it("демо включается только явным параметром", () => {
    expect(isCashbackDemo("?demo=cashback")).toBe(true);
    expect(isCashbackDemo("")).toBe(false);
    expect(isCashbackDemo("?demo=1")).toBe(false);
});
