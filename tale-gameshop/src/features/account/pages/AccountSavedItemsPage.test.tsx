import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Страница «Сохранённые»: под списком одна лента «Недавно просмотренные» (рекомендации живут на
 * обзоре кабинета), её кнопки «В корзину» действительно кладут игру в корзину, а игра, которой
 * больше нет в каталоге, уходит из списка — иначе счётчик в меню кабинета её продолжал считать.
 */

const mockDispatch = jest.fn();
const mockRemove = jest.fn(async () => undefined);

const portal = { id: "portal", slug: "portal-2", title: "Portal 2", name: "Portal 2", price: 9.99, imagePath: "/p.png", releaseDate: "2011-02-27" };
const witness = { id: "witness", slug: "the-witness", title: "The Witness", name: "The Witness", price: 39.99, imagePath: "/w.png", currency: "USD" };

jest.mock("../components/AccountShell", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("../../../components/common/HoverTrailer", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../context/wishlist-context", () => ({
  useWishlist: () => ({ ids: new Set(["portal", "gone"]), remove: mockRemove }),
}));
jest.mock("../../../context/cart-context", () => ({ useCart: () => ({ dispatch: mockDispatch }) }));
jest.mock("../../../hooks/use-viewed-games", () => ({
  useViewedGames: () => ({
    items: [{ game: witness, lastViewedAt: "2026-09-30T10:00:00Z", viewCount: 1 }],
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));
jest.mock("../../../inversify.config", () => ({
  __esModule: true,
  default: {
    get: () => ({
      getGameById: (id: string) =>
        id === "portal" ? Promise.resolve(portal) : Promise.reject({ response: { status: 404 } }),
    }),
  },
}));

// eslint-disable-next-line import/first
import AccountSavedItemsPage from "./AccountSavedItemsPage";

const renderPage = () => render(<MemoryRouter><AccountSavedItemsPage /></MemoryRouter>);

beforeEach(() => {
  mockDispatch.mockClear();
  mockRemove.mockClear();
});

test("под списком одна лента — недавно просмотренные, без второго блока рекомендаций", async () => {
  renderPage();
  await screen.findByText("Portal 2");
  expect(screen.getByTestId("saved-recently-viewed")).toBeInTheDocument();
  expect(screen.queryByTestId("saved-recommendations")).not.toBeInTheDocument();
});

test("«В корзину» в ленте кладёт игру в корзину", async () => {
  renderPage();
  const row = screen.getByTestId("saved-recently-viewed");
  fireEvent.click(within(row).getByRole("button", { name: "Add to cart" }));
  expect(mockDispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: "ADD_TO_CART", payload: expect.objectContaining({ gameId: "witness", quantity: 1 }) }),
  );
});

test("лента без полосы прокрутки: край затухает там, где есть продолжение, стрелки гаснут у краёв", async () => {
  renderPage();
  const row = screen.getByTestId("saved-recently-viewed");
  const list = row.querySelector<HTMLElement>(".saved-horizontal-list")!;
  // jsdom не считает раскладку: задаём ленту шире видимой области вручную.
  Object.defineProperty(list, "scrollWidth", { configurable: true, value: 1000 });
  Object.defineProperty(list, "clientWidth", { configurable: true, value: 400 });

  list.scrollLeft = 0;
  fireEvent.scroll(list);
  await waitFor(() => expect(list).toHaveClass("is-fade-end"));
  expect(list).not.toHaveClass("is-fade-start");
  expect(within(row).getByRole("button", { name: "Scroll left" })).toBeDisabled();
  expect(within(row).getByRole("button", { name: "Scroll right" })).toBeEnabled();

  list.scrollLeft = 600;
  fireEvent.scroll(list);
  await waitFor(() => expect(list).toHaveClass("is-fade-start"));
  expect(list).not.toHaveClass("is-fade-end");
  expect(within(row).getByRole("button", { name: "Scroll right" })).toBeDisabled();
});

test("игру, которой больше нет в каталоге, страница убирает из списка", async () => {
  renderPage();
  await screen.findByText("Portal 2");
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("gone"));
  expect(mockRemove).not.toHaveBeenCalledWith("portal");
});
