import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminHeaderContext } from "../../components/layout/AdminHeaderContext";
import AdminGameKeysPage from "./AdminGameKeysPage";

/**
 * Страница ключей целиком: список остатков, открытие панели по клику на строку и защита
 * от закрытия панели с несохранённой пачкой ключей.
 *
 * Такой тест — замена ручной проверки в браузере: админка за формой входа, и почти всё, что
 * ломалось в этих экранах (бесконечная перезагрузка таблицы, пустой экран вместо таблицы),
 * компилятор и сборка пропускали. Здесь страница действительно рисуется и на неё нажимают.
 */

const mockGetKeyOverview = jest.fn();
const mockGetOwedKeys = jest.fn();
const mockGetKeyRegionOverview = jest.fn();
const mockGetKeyInventory = jest.fn();
const mockListKeys = jest.fn();
const mockGetGameEditions = jest.fn();

jest.mock("../../api/adminKeysApi", () => ({
  getKeyOverview: (...args: unknown[]) => mockGetKeyOverview(...args),
  getOwedKeys: (...args: unknown[]) => mockGetOwedKeys(...args),
  getKeyRegionOverview: (...args: unknown[]) => mockGetKeyRegionOverview(...args),
  getKeyInventory: (...args: unknown[]) => mockGetKeyInventory(...args),
  listKeys: (...args: unknown[]) => mockListKeys(...args),
  getGameEditions: (...args: unknown[]) => mockGetGameEditions(...args),
  addKeysToInventory: jest.fn(),
  setRegionPrice: jest.fn(),
  setGameRegionPolicy: jest.fn(),
  grantKey: jest.fn(),
  voidKey: jest.fn(),
  purgeKey: jest.fn(),
  editKey: jest.fn(),
  importKeys: jest.fn(),
  setLowStockThreshold: jest.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminHeaderContext.Provider value={{ title: "", setPageTitle: () => undefined }}>
        <AdminGameKeysPage />
      </AdminHeaderContext.Provider>
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();

  mockGetKeyOverview.mockResolvedValue({
    totals: { games: 2, available: 9, delivered: 0, awaiting: 0, outOfStock: 1, lowStock: 0 },
    lowThreshold: 5,
    status: "all",
    query: null,
    page: 1,
    pageSize: 50,
    total: 2,
    games: [
      { gameId: "g1", title: "Baba Is You", available: 9, delivered: 0, voided: 0, awaiting: 0, outOfStock: false, low: false },
      { gameId: "g2", title: "Portal 2", available: 0, delivered: 0, voided: 0, awaiting: 0, outOfStock: true, low: false },
    ],
  });
  mockGetOwedKeys.mockResolvedValue({ lines: [] });
  mockGetKeyRegionOverview.mockResolvedValue({
    lowThreshold: 5,
    soonDays: 7,
    windowDays: 30,
    days: [],
    regions: [],
    games: [],
    gamesTotal: 0,
    outOfKeys: [],
    outOfKeysTotal: 0,
    totalDaily: [],
  });
  mockGetKeyInventory.mockResolvedValue({ available: 9, assigned: 0, regionPolicy: null });
  mockGetGameEditions.mockResolvedValue([]);
  mockListKeys.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
});

test("остаток по играм показывается списком", async () => {
  renderPage();

  expect(await screen.findByText("Baba Is You", {}, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getByText("Portal 2")).toBeInTheDocument();
});

test("клик по строке открывает ключи именно этой игры", async () => {
  renderPage();
  const row = await screen.findByText("Baba Is You", {}, { timeout: 5000 });

  await userEvent.click(row);

  // Заголовок панели называет игру: раньше он врал, потому что наверх уходил только id.
  expect(await screen.findByText("Keys — Baba Is You", {}, { timeout: 5000 })).toBeInTheDocument();
  await waitFor(() => expect(mockListKeys).toHaveBeenCalledWith("g1", expect.anything()), { timeout: 5000 });
});

test("список остатков не перезагружает себя", async () => {
  renderPage();
  await screen.findByText("Baba Is You", {}, { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 700));

  // Один заход за окном строк. Больше — значит таблица снова крутит саму себя.
  expect(mockGetKeyOverview.mock.calls.length).toBeLessThanOrEqual(2);
});

test("панель не закрывается молча, если в неё вставили ключи", async () => {
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
  renderPage();

  await userEvent.click(await screen.findByText("Baba Is You", {}, { timeout: 5000 }));
  const textarea = await screen.findByPlaceholderText(/AAAAA-BBBBB-CCCCC/i, {}, { timeout: 5000 });
  await userEvent.type(textarea, "KEY-1");

  await waitFor(() => expect(textarea).toHaveValue("KEY-1"));

  // Escape — тот же путь закрытия, что и клик мимо панели.
  await userEvent.keyboard("{Escape}");

  expect(confirmSpy).toHaveBeenCalled();
  // Отказались — панель осталась вместе с набранным.
  expect(screen.getByText("Keys — Baba Is You")).toBeInTheDocument();
  expect(textarea).toHaveValue("KEY-1");

  confirmSpy.mockRestore();
});
