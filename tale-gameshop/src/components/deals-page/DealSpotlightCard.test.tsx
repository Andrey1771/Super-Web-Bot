import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DealSpotlightCard from "./DealSpotlightCard";
import type { Game } from "../../models/game";

/**
 * Главная карточка страницы скидок. У обычных плиток есть сердечко вишлиста и значок платформы, а у неё
 * долго не было ни того ни другого — при том, что это самая заметная карточка страницы.
 */

const mockToggle = jest.fn();
jest.mock("../../context/wishlist-context", () => ({
    useWishlist: () => ({ isWishlisted: (id?: string | null) => id === "wished", toggle: mockToggle }),
}));

jest.mock("../../context/site-preferences", () => ({
    formatMoney: (value: number, currency: string) => `${currency} ${value.toFixed(2)}`,
}));

const game = (overrides: Partial<Game> = {}): Game => ({
    id: "g1",
    name: "Portal 2",
    title: "Portal 2",
    price: 9.99,
    platforms: ["PC", "Mac", "Unknown"],
    ...overrides,
} as Game);

const show = (g: Game) => render(
    <MemoryRouter>
        <DealSpotlightCard
            game={g}
            regularPrice={9.99}
            finalPrice={2.2}
            percent={78}
            currency="USD"
            baseUrl=""
            href="/games/portal-2"
            onAddToCart={jest.fn()}
        />
    </MemoryRouter>,
);

beforeEach(() => mockToggle.mockClear());

it("lets the buyer wishlist the star deal right from the card", async () => {
    show(game());

    const heart = screen.getByRole("button", { name: "Add to wishlist" });
    expect(heart).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(heart);
    expect(mockToggle).toHaveBeenCalledWith("g1");
});

it("shows the heart as filled when the game is already wishlisted", () => {
    show(game({ id: "wished" }));

    expect(screen.getByRole("button", { name: "Remove from wishlist" })).toHaveAttribute("aria-pressed", "true");
});

it("names the platforms the key works on and skips labels it has no icon for", () => {
    show(game());

    const platforms = screen.getByRole("list", { name: "Platforms" });
    expect(platforms).toHaveTextContent("PC");
    expect(platforms).toHaveTextContent("Mac");
    expect(platforms).not.toHaveTextContent("Unknown");
});

it("shows software systems as short labels instead of game platform icons", () => {
    show(game({ kind: "Software", platforms: ["Windows", "macOS"] } as Partial<Game>));

    const platforms = screen.getByRole("list", { name: "Platforms" });
    expect(platforms).toHaveTextContent("WIN");
    expect(platforms).toHaveTextContent("MAC");
});

it("plays the trailer over the cover after a pause on the card", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("hover: hover"), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
    jest.useFakeTimers();
    try {
        show(game({ trailerUrl: "/uploads/demo-media/trailer.mp4", trailerPosterUrl: "/uploads/demo-media/trailer.svg" } as Partial<Game>));
        const card = screen.getByRole("article");
        fireEvent.pointerEnter(card);
        act(() => { jest.advanceTimersByTime(450); });
        const video = screen.getByTestId("hover-trailer");
        expect(video).toHaveAttribute("src", expect.stringContaining("/uploads/demo-media/trailer.mp4"));
        fireEvent.pointerLeave(card);
        expect(screen.queryByTestId("hover-trailer")).toBeNull();
    } finally {
        jest.useRealTimers();
        window.matchMedia = originalMatchMedia;
    }
});
