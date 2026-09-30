import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CashbackEntry, CashbackStatus } from "../../../hooks/use-cashback-status";

// Оболочка кабинета тянет профиль, Keycloak и счётчики — странице кэшбэка они не нужны.
jest.mock("../components/AccountShell", () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let mockStatus: CashbackStatus;
jest.mock("../../../hooks/use-cashback-status", () => ({
    ...jest.requireActual("../../../hooks/use-cashback-status"),
    useCashbackStatus: () => mockStatus,
}));

// eslint-disable-next-line import/first
import AccountRewardsPage from "./AccountRewardsPage";

const entry = (over: Partial<CashbackEntry>): CashbackEntry => ({
    id: Math.random().toString(36),
    type: "earn",
    orderNumber: "TS-1",
    gameTitle: "Game",
    imagePath: null,
    date: "2026-09-01",
    orderTotal: 50,
    orderCurrency: "USD",
    percent: 5,
    amount: 2.5,
    status: "available",
    ...over,
});

const base: CashbackStatus = {
    ready: true,
    signedIn: true,
    isDemo: false,
    totalSpent: 0,
    available: 0,
    pending: 0,
    nextUnlockAt: null,
    earnedAllTime: 0,
    usedAllTime: 0,
    history: [],
    loaded: true,
    error: false,
    currency: "USD",
    level: {
        tierId: "rookie",
        nextTierId: "veteran",
        remainingToNext: 200,
        progress: 0,
        tiers: [
            { id: "rookie", name: "Rookie", percent: 3, spendThreshold: null },
            { id: "veteran", name: "Veteran", percent: 5, spendThreshold: 200 },
            { id: "elite", name: "Elite", percent: 7, spendThreshold: 1000 },
            { id: "legend", name: "Legend", percent: 10, spendThreshold: 3000 },
        ],
    },
};

const show = () => render(<MemoryRouter><AccountRewardsPage /></MemoryRouter>);

it("новый аккаунт: стартовый уровень и приглашение к первому заказу вместо таблицы", () => {
    mockStatus = base;
    show();
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("You are here").closest("li")).toHaveTextContent("Rookie");
});

it("фильтр статуса оставляет только подходящие записи", () => {
    mockStatus = {
        ...base,
        totalSpent: 436.13,
        level: { ...base.level, tierId: "veteran", nextTierId: "elite", remainingToNext: 563.87, progress: 0.3 },
        history: [
            entry({ gameTitle: "Sekiro", status: "pending", unlocksAt: "2026-09-24", date: "2026-09-10" }),
            entry({ gameTitle: "Hogwarts Legacy", date: "2026-08-29" }),
            entry({ gameTitle: "Palworld", status: "reverted", date: "2026-08-20" }),
        ],
    };
    show();

    expect(screen.getByText("You are here").closest("li")).toHaveTextContent("Veteran");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Sekiro")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Refunded/ }));
    expect(within(table).getByText("Palworld")).toBeInTheDocument();
    expect(within(table).queryByText("Sekiro")).not.toBeInTheDocument();
    expect(within(table).queryByText("Hogwarts Legacy")).not.toBeInTheDocument();
});

it("на верхнем уровне сумма трат и полоса прогресса не показываются", () => {
    mockStatus = {
        ...base,
        totalSpent: 43536.99,
        level: {
            ...base.level,
            tierId: "top",
            nextTierId: null,
            remainingToNext: null,
            progress: 1,
            tiers: [...base.level.tiers, { id: "top", name: "543t", percent: 33, spendThreshold: 35004 }],
        },
    };
    show();

    expect(screen.getByText("Top level reached")).toBeInTheDocument();
    expect(screen.getByText("543t — the highest tier")).toBeInTheDocument();
    expect(screen.getByText("back on every order")).toBeInTheDocument();
    expect(screen.getByText("Levels never go down")).toBeInTheDocument();
    // Идти некуда: число перестаёт быть прогрессом и читается как счёт, выставленный покупателю.
    expect(screen.queryByText(/spent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/43,536/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

it("на промежуточном уровне сумма трат и цель остаются", () => {
    mockStatus = {
        ...base,
        totalSpent: 436.13,
        level: { ...base.level, tierId: "veteran", nextTierId: "elite", remainingToNext: 563.87, progress: 0.3 },
    };
    show();

    expect(screen.getByText(/436\.13/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /Progress to Elite/ })).toBeInTheDocument();
});

it("поиск по номеру заказа", () => {
    mockStatus = {
        ...base,
        history: [
            entry({ gameTitle: "Sekiro", orderNumber: "TS-10482" }),
            entry({ gameTitle: "Palworld", orderNumber: "TS-10340" }),
        ],
    };
    show();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "10340" } });
    const table = screen.getByRole("table");
    expect(within(table).getByText("Palworld")).toBeInTheDocument();
    expect(within(table).queryByText("Sekiro")).not.toBeInTheDocument();
});
