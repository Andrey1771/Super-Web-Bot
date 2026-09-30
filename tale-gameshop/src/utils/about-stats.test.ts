import {
  buildResponseTime,
  buildStatTiles,
  formatResponseTime,
  EMPTY_ABOUT_STATS,
  MIN_COUNTRIES,
  MIN_GAMES,
  MIN_KEYS,
  MIN_SUPPORT_SAMPLE,
} from "./about-stats";
import type { AboutStats } from "./about-stats";

const stats = (over: Partial<AboutStats> = {}): AboutStats => ({ ...EMPTY_ABOUT_STATS, ...over });

describe("плитки масштаба", () => {
  it("у нового магазина плиток нет вовсе — пустой блок честнее выдуманного", () => {
    expect(buildStatTiles(stats())).toEqual([]);
  });

  it("показывает только то, что дошло до порога", () => {
    const tiles = buildStatTiles(stats({ gamesInCatalog: 52, keysDelivered: 77, countriesServed: 1 }));
    expect(tiles.map((tile) => tile.label)).toEqual(["Games in the catalog"]);
  });

  it("год основания берётся из настроек и без него плитки нет", () => {
    expect(buildStatTiles(stats()).some((tile) => tile.label === "Founded")).toBe(false);
    expect(buildStatTiles(stats({ foundedYear: 2024 }))[0]).toEqual({ value: "2024", label: "Founded" });
  });

  it("порядок плиток не зависит от того, какие прошли порог", () => {
    const tiles = buildStatTiles(
      stats({ foundedYear: 2024, gamesInCatalog: 500, countriesServed: 12, keysDelivered: 9000 })
    );
    expect(tiles.map((tile) => tile.label)).toEqual([
      "Founded",
      "Games in the catalog",
      "Countries served",
      "Keys delivered",
    ]);
  });

  it("числа не округляются вверх и не получают «+»", () => {
    const tiles = buildStatTiles(stats({ gamesInCatalog: 5231, keysDelivered: 48912 }));
    expect(tiles.find((tile) => tile.label === "Games in the catalog")?.value).toBe("5,231");
    expect(tiles.find((tile) => tile.label === "Keys delivered")?.value).toBe("48,912");
  });

  it("ровно на пороге плитка уже показывается", () => {
    const tiles = buildStatTiles(
      stats({ gamesInCatalog: MIN_GAMES, keysDelivered: MIN_KEYS, countriesServed: MIN_COUNTRIES })
    );
    expect(tiles).toHaveLength(3);
  });
});

describe("время ответа поддержки", () => {
  it("на малой выборке не показывается: медиана по трём обращениям — случайность", () => {
    expect(buildResponseTime(stats({ supportMedianMinutes: 4, supportSampleSize: 3 }))).toBeNull();
  });

  it("считать не по чему — строки нет", () => {
    expect(buildResponseTime(stats({ supportMedianMinutes: null, supportSampleSize: 500 }))).toBeNull();
  });

  it("на достаточной выборке показывает медиану", () => {
    expect(buildResponseTime(stats({ supportMedianMinutes: 12, supportSampleSize: MIN_SUPPORT_SAMPLE }))).toBe("12 min");
  });

  it("округляет тем грубее, чем дольше ждать", () => {
    expect(formatResponseTime(0.4)).toBe("under a minute");
    expect(formatResponseTime(47)).toBe("47 min");
    expect(formatResponseTime(95)).toBe("about 2 h");
    expect(formatResponseTime(60 * 25)).toBe("about a day");
    expect(formatResponseTime(60 * 24 * 3)).toBe("about 3 days");
  });
});

describe("возможности магазина, а не его объём", () => {
  it("жанры и регионы показываются на низком пороге: их можно пересчитать самому", () => {
    const tiles = buildStatTiles(stats({ gamesInCatalog: 52, genresInCatalog: 12, activationRegions: 9 }));
    expect(tiles.map((tile) => tile.label)).toEqual([
      "Games in the catalog",
      "Genres on the shelf",
      "Activation regions",
    ]);
  });

  it("пустой каталог не рисует ни жанров, ни регионов", () => {
    expect(buildStatTiles(stats({ genresInCatalog: 0, activationRegions: 0 }))).toEqual([]);
  });

  it("порядок плиток остаётся постоянным при любом наборе", () => {
    const tiles = buildStatTiles(
      stats({
        foundedYear: 2024,
        gamesInCatalog: 500,
        genresInCatalog: 12,
        activationRegions: 9,
        countriesServed: 12,
        keysDelivered: 9000,
      })
    );
    expect(tiles.map((tile) => tile.label)).toEqual([
      "Founded",
      "Games in the catalog",
      "Genres on the shelf",
      "Activation regions",
      "Countries served",
      "Keys delivered",
    ]);
  });
});
