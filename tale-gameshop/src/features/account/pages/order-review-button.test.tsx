import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OrderItemRow } from "./AccountOrdersPage";
import type { AccountOrderDetailItem } from "../../../types/account-orders";

const item = (over: Partial<AccountOrderDetailItem> = {}): AccountOrderDetailItem => ({
  itemId: "item-1",
  productType: "Game",
  gameId: "game-1",
  title: "Baldur's Gate 3",
  coverUrl: null,
  platform: "PC",
  region: null,
  quantity: 1,
  unitPrice: 59.99,
  currency: "USD",
  unitDiscount: 0,
  finalUnitPrice: 59.99,
  lineTotal: 59.99,
  deliveryType: "Key",
  keys: ["AAA-***"],
  slug: "baldurs-gate-3",
  available: true,
  canReview: true,
  hasReview: false,
  ...over,
});

const show = (over: Partial<AccountOrderDetailItem> = {}) =>
  render(<MemoryRouter><OrderItemRow item={item(over)} /></MemoryRouter>);

it("зовёт оценить купленное и ведёт сразу на вкладку отзывов", () => {
  show();
  const link = screen.getByRole("link", { name: /Leave a review/ });
  expect(link).toHaveAttribute("href", "/games/baldurs-gate-3?tab=reviews");
});

it("если отзыв уже написан — предлагает править, а не писать заново", () => {
  show({ hasReview: true });
  expect(screen.getByRole("link", { name: /Edit your review/ })).toBeInTheDocument();
  expect(screen.queryByText(/Leave a review/)).not.toBeInTheDocument();
});

it("решение принимает сервер: без canReview кнопки нет", () => {
  show({ canReview: false });
  expect(screen.queryByText(/Leave a review/)).not.toBeInTheDocument();
});

it("без slug вести некуда — ни кнопки, ни ссылки на строке", () => {
  show({ slug: null });
  expect(screen.queryByText(/Leave a review/)).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("строка товара ведёт на страницу игры по slug, а не по идентификатору", () => {
  show({ canReview: false });
  expect(screen.getByRole("link", { name: /Open Baldur/ })).toHaveAttribute("href", "/games/baldurs-gate-3");
});

it("ссылка на отзыв не вложена в ссылку строки — это невалидная разметка", () => {
  const { container } = show();
  const nested = container.querySelector("a a");
  expect(nested).toBeNull();
});

it("название — тоже ссылка на игру", () => {
  show();
  expect(screen.getByRole("link", { name: "Baldur's Gate 3" })).toHaveAttribute("href", "/games/baldurs-gate-3");
});

it("снятый с продажи товар остаётся в истории без ссылки и с пометкой", () => {
  show({ available: false, slug: null, canReview: false });
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("Baldur's Gate 3")).toBeInTheDocument();
  expect(screen.getByText("No longer sold")).toBeInTheDocument();
});

it("ключи целиком показываются вместо маски, с кнопкой «Copy»", () => {
  render(<MemoryRouter><OrderItemRow item={item()} revealedKeys={["AAAAA-BBBBB-CCCCC"]} /></MemoryRouter>);
  expect(screen.getByText("AAAAA-BBBBB-CCCCC")).toBeInTheDocument();
  expect(screen.queryByText("AAA-***")).toBeNull();
  expect(screen.getByRole("button", { name: /Copy key/ })).toBeInTheDocument();
});
