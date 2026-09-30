import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DealsPage from "./deals-page";

/**
 * Витрина скидок как посадочная страница, а не вторая копия каталога.
 *
 * Тест держит два обещания этой страницы. Первое: число в шапке говорит про ВСЕ скидки,
 * а показанное окно названо окном — раньше страница молча брала 48 позиций и подписывала
 * их как «столько игр на распродаже». Второе: порядок «скоро закончится» спрашивается
 * у сервера, а не пересортировкой приехавшего окна — в окне лежат самые крупные скидки,
 * и самой срочной среди них может не быть вовсе.
 */

const mockApiGet = jest.fn();

jest.mock("../../inversify.config", () => ({
    __esModule: true,
    // Одна заглушка на оба сервиса: странице нужен api у клиента и apiBaseUrl у url-сервиса.
    default: { get: () => ({ api: { get: (...args: unknown[]) => mockApiGet(...args) }, apiBaseUrl: "http://api.test" }) },
}));

jest.mock("../../context/cart-context", () => ({
    useCart: () => ({ dispatch: jest.fn() }),
}));

jest.mock("../../context/site-preferences", () => ({
    useSitePreferences: () => ({ currency: "USD" }),
    formatMoney: (value: number) => `$${value}`,
}));

jest.mock("../../utils/item-list-tracking", () => ({
    ITEM_LISTS: { deals: "deals" },
    trackItemSelect: jest.fn(),
    useItemListView: jest.fn(),
}));

// Подписку переключаем по тесту: от неё зависит текст пустого состояния.
let mockKnownSubscription: "confirmed" | "pending" | null = null;
jest.mock("../../hooks/use-newsletter-subscribed", () => ({
    useKnownNewsletterSubscription: () => mockKnownSubscription,
    rememberNewsletterSubscription: jest.fn(),
}));

const mockSubscribe = jest.fn();
jest.mock("../../api/newsletterApi", () => ({
    subscribeNewsletter: (...args: unknown[]) => mockSubscribe(...args),
}));

const deal = (title: string, percent: number, endsAt?: string) => ({
    id: title,
    slug: title.toLowerCase(),
    title,
    name: title,
    price: 100,
    finalPrice: 100 - percent,
    discountPercent: percent,
    discountActive: true,
    discountEndsAt: endsAt,
    imagePath: "cover.png",
});

const renderPage = () => render(
    <MemoryRouter>
        <DealsPage />
    </MemoryRouter>,
);

beforeEach(() => {
    jest.clearAllMocks();
    mockKnownSubscription = null;
});

it("says how much of the sale it is showing and links to the rest", async () => {
    mockApiGet.mockResolvedValue({
        data: { items: [deal("Big Cut", 70), deal("Small Cut", 10)], total: 137 },
    });

    renderPage();

    expect(await screen.findByText("Showing 2 of 137")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See all 137 deals/ }))
        .toHaveAttribute("href", "/games?onSale=1&sortBy=discount");
});

it("keeps quiet about the catalog when the whole sale fits", async () => {
    mockApiGet.mockResolvedValue({ data: { items: [deal("Only One", 30)], total: 1 } });

    renderPage();

    expect(await screen.findByText("1 game")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /See all/ })).not.toBeInTheDocument();
});

it("asks the server for the ending-soon order instead of re-sorting the window", async () => {
    const soon = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    // Ответ приходит ЗАДАЧЕЙ, а не микрозадачей: между запросом и ответом успевает пройти
    // перерисовка — как в браузере с настоящей сетью. С мгновенным моком страница один раз
    // уже проехала мимо гонки, из-за которой переключатель залипал в «Ending soon…».
    mockApiGet.mockImplementation((url: string) => new Promise((resolve) => setTimeout(() => resolve(
        url.includes("sort=ending-soon")
            ? { data: { items: [deal("Ends Tonight", 10, soon)], total: 2 } }
            : { data: { items: [deal("Big Cut", 70), deal("Ends Tonight", 10, soon)], total: 2 } }), 0)));

    renderPage();
    await screen.findByText("Big Cut");

    await userEvent.click(screen.getByRole("button", { name: "Ending soon" }));

    await waitFor(() => expect(screen.queryByText("Big Cut")).not.toBeInTheDocument());
    expect(mockApiGet.mock.calls.some(([url]: [string]) => url.includes("sort=ending-soon"))).toBe(true);
    expect(screen.getByText("Ends Tonight")).toBeInTheDocument();
    // Кнопка вернулась из «Ending soon…» — то есть загрузка действительно завершилась.
    expect(screen.getByRole("button", { name: "Ending soon" })).toHaveAttribute("aria-pressed", "true");
});

it("counts down only on the deals that are actually about to expire", async () => {
    const soon = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    const later = new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString();
    mockApiGet.mockResolvedValue({
        data: {
            items: [deal("Headliner", 60, soon), deal("Hurry", 40, soon), deal("Relax", 40, later)],
            total: 3,
        },
    });

    renderPage();

    // У крупной карточки отсчёт свой, крупный; у обычных — бейдж на обложке.
    expect(await screen.findByText("Offer ends in")).toBeInTheDocument();
    expect(screen.getByText(/Ends in 0[45]:/)).toBeInTheDocument();
    // Вечное «ещё 39 дней» не торопит, а шумит — на такой скидке отсчёта нет.
    expect(screen.queryByText(/Ends in 39d/)).not.toBeInTheDocument();
});

it("leads with one deal instead of a flat carpet, and does not repeat it in the grid", async () => {
    mockApiGet.mockResolvedValue({
        data: { items: [deal("Headliner", 60), deal("Second", 20)], total: 2 },
    });

    renderPage();

    expect(await screen.findByText("Star deal")).toBeInTheDocument();
    // Ровно один раз: герой берётся из общего списка, а не добавляется к нему.
    expect(screen.getAllByText("Headliner")).toHaveLength(1);
    // Экономия суммой рядом с ценой — то, чего в обычной плитке нет.
    expect(screen.getByText("You save $60")).toBeInTheDocument();
});

it("offers deal alerts from the hero instead of wedging a block into the listing", async () => {
    mockApiGet.mockResolvedValue({ data: { items: [deal("Big Cut", 70)], total: 1 } });
    mockSubscribe.mockResolvedValue("pending");

    renderPage();
    await screen.findByText("Big Cut");

    // У витрин, с которых мы это списали (Fanatical, GOG, Humble), листинг скидок
    // заканчивается товарами: формы в потоке нет, пока её не попросят.
    expect(screen.queryByLabelText("Email for deal alerts")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse the full catalog/ })).toHaveAttribute("href", "/games");

    await userEvent.click(screen.getByRole("button", { name: /deal alerts/i }));
    await userEvent.type(screen.getByLabelText("Email for deal alerts"), "buyer@test.dev");
    await userEvent.click(screen.getByRole("button", { name: "Notify me" }));

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith("buyer@test.dev", "deals", true));
    expect(await screen.findByText(/Almost there/)).toBeInTheDocument();
});

/**
 * Пустая витрина — законное состояние: скидки кончаются, новые приходят не сразу.
 * Важно, чтобы она не выглядела поломкой. Самое обидное здесь — попросить почту у того,
 * кто её уже оставил: просьба без поля ввода читается как сломанная страница.
 */
it("без скидок предлагает подписаться и уводит в каталог", async () => {
    mockApiGet.mockResolvedValue({ data: { items: [], total: 0 } });

    renderPage();

    expect(await screen.findByText("Deals are taking a short break")).toBeInTheDocument();
    expect(screen.getByText(/Leave your email/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse the full catalog/ })).toHaveAttribute("href", "/games");
});

it("у подписавшегося не просит почту второй раз", async () => {
    mockKnownSubscription = "confirmed";
    mockApiGet.mockResolvedValue({ data: { items: [], total: 0 } });

    renderPage();

    await screen.findByText("Deals are taking a short break");
    // Раньше текст был один на оба случая: «оставьте почту» стояло прямо над «вы уже в списке».
    expect(screen.queryByText(/Leave your email/)).not.toBeInTheDocument();
    expect(screen.getByText(/write as soon as the next batch/)).toBeInTheDocument();
});
