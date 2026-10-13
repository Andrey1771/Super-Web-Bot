import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReviewsCarousel from "./ReviewsCarousel";
import type { SiteReviewQuote } from "../../api/reviewsApi";

const quote = (index: number, over: Partial<SiteReviewQuote> = {}): SiteReviewQuote => ({
  author: `Player ${index}`,
  rating: 5,
  text: `Review number ${index}`,
  verifiedPurchase: true,
  createdAt: `2026-08-0${index}T10:00:00.000Z`,
  gameTitle: `Game ${index}`,
  gameSlug: `game-${index}`,
  avatarUrl: null,
  ...over,
});

const show = (quotes: SiteReviewQuote[]) =>
  render(<MemoryRouter><ReviewsCarousel quotes={quotes} /></MemoryRouter>);

/** matchMedia в jsdom нет — подставляем свой и управляем ответом про reduced-motion. */
const setReducedMotion = (reduce: boolean) => {
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  });
};

beforeEach(() => {
  setReducedMotion(false);
  // scrollTo в jsdom не реализован — подменяем, чтобы поймать вызовы.
  Element.prototype.scrollTo = jest.fn() as unknown as Element["scrollTo"];
});

it("показывает все отзывы, а не только видимые", () => {
  show([1, 2, 3, 4].map((n) => quote(n)));
  expect(screen.getByText(/Review number 1/)).toBeInTheDocument();
  expect(screen.getByText(/Review number 4/)).toBeInTheDocument();
});

it("точек столько же, сколько отзывов: листается по одному", () => {
  show([1, 2, 3].map((n) => quote(n)));
  expect(screen.getAllByRole("button", { name: /Review \d of 3/ })).toHaveLength(3);
});

it("на единственном отзыве управления нет — листать нечего", () => {
  show([quote(1)]);
  expect(screen.queryByRole("button", { name: "Next reviews" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Review 1 of/ })).not.toBeInTheDocument();
});

it("в начале ленты «назад» недоступно", () => {
  show([1, 2, 3].map((n) => quote(n)));
  expect(screen.getByRole("button", { name: "Previous reviews" })).toBeDisabled();
});

it("щелчок по точке прокручивает к нужной карточке", () => {
  show([1, 2, 3].map((n) => quote(n)));
  fireEvent.click(screen.getByRole("button", { name: "Review 3 of 3" }));
  expect(Element.prototype.scrollTo).toHaveBeenCalled();
});

it("автопрокрутка не запускается, если человек просил меньше движения", () => {
  jest.useFakeTimers();
  setReducedMotion(true);
  show([1, 2, 3].map((n) => quote(n)));

  act(() => { jest.advanceTimersByTime(60_000); });

  expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
  jest.useRealTimers();
});

it("автопрокрутка листает сама и останавливается под курсором", () => {
  jest.useFakeTimers();
  const { container } = show([1, 2, 3].map((n) => quote(n)));

  act(() => { jest.advanceTimersByTime(8000); });
  expect(Element.prototype.scrollTo).toHaveBeenCalledTimes(1);

  // Курсор на ленте — листать из-под руки читающего нельзя.
  fireEvent.mouseEnter(container.querySelector(".about-voices-carousel")!);
  act(() => { jest.advanceTimersByTime(24_000); });
  expect(Element.prototype.scrollTo).toHaveBeenCalledTimes(1);

  fireEvent.mouseLeave(container.querySelector(".about-voices-carousel")!);
  act(() => { jest.advanceTimersByTime(8000); });
  expect(Element.prototype.scrollTo).toHaveBeenCalledTimes(2);

  jest.useRealTimers();
});

it("отзыв ведёт на страницу своей игры", () => {
  show([quote(7)]);
  expect(screen.getByRole("link", { name: "Game 7" })).toHaveAttribute("href", "/games/game-7");
});

it("без отзывов не рисует ничего", () => {
  const { container } = show([]);
  expect(container).toBeEmptyDOMElement();
});

it("у автора с аватаром показываем его, а не букву", () => {
  const { container } = show([quote(1, { author: "Sam Rivera", avatarUrl: "/uploads/avatars/sam.png" })]);

  const img = container.querySelector(".about-quote-avatar img") as HTMLImageElement;
  expect(img).not.toBeNull();
  expect(img.getAttribute("src")).toBe("/uploads/avatars/sam.png");
  expect(screen.queryByText("S")).not.toBeInTheDocument();
});

it("без аватара остаётся первая буква имени", () => {
  const { container } = show([quote(1, { author: "Sam Rivera", avatarUrl: null })]);

  expect(container.querySelector(".about-quote-avatar img")).toBeNull();
  expect(screen.getByText("S")).toBeInTheDocument();
});

// Человек мог сменить или удалить аватар после отзыва, а адрес остался записанным в самом
// отзыве. Сломанная иконка с alt-текстом на её месте читалась бы как поломка витрины.
it("битая ссылка на аватар откатывается к букве", () => {
  const { container } = show([quote(1, { author: "Sam Rivera", avatarUrl: "/uploads/avatars/gone.png" })]);

  fireEvent.error(container.querySelector(".about-quote-avatar img")!);

  expect(container.querySelector(".about-quote-avatar img")).toBeNull();
  expect(screen.getByText("S")).toBeInTheDocument();
});
