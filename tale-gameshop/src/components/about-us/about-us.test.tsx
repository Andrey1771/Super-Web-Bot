import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AboutUs from "./about-us";
import { getSiteReviewSummary, getAboutStats, getAboutTeam } from "../../api/reviewsApi";
import type { SiteReviewSummary } from "../../api/reviewsApi";
import { EMPTY_ABOUT_STATS } from "../../utils/about-stats";
import type { AboutStats } from "../../utils/about-stats";

jest.mock("../../api/reviewsApi", () => ({
  ...jest.requireActual("../../api/reviewsApi"),
  getSiteReviewSummary: jest.fn(),
  getAboutStats: jest.fn(),
  getAboutTeam: jest.fn(),
}));

const mocked = getSiteReviewSummary as jest.MockedFunction<typeof getSiteReviewSummary>;
const mockedStats = getAboutStats as jest.MockedFunction<typeof getAboutStats>;
const mockedTeam = getAboutTeam as jest.MockedFunction<typeof getAboutTeam>;

const aboutStats = (over: Partial<AboutStats> = {}): AboutStats => ({ ...EMPTY_ABOUT_STATS, ...over });

const summary = (over: Partial<SiteReviewSummary> = {}): SiteReviewSummary => ({
  average: 0,
  count: 0,
  distribution: {},
  quotes: [],
  ...over,
});

const show = () => render(<MemoryRouter><AboutUs /></MemoryRouter>);

beforeEach(() => {
  mocked.mockReset();
  mockedStats.mockReset();
  mockedStats.mockResolvedValue(aboutStats());
  mockedTeam.mockReset();
  mockedTeam.mockResolvedValue([]);
});

it("показывает оценку, посчитанную сервером, а не вписанную в код", async () => {
  mocked.mockResolvedValue(
    summary({ average: 4.147, count: 61, distribution: { "5": 23, "4": 26, "3": 10, "2": 2 } })
  );
  show();

  expect(await screen.findByText("4.1")).toBeInTheDocument();
  expect(screen.getByText("Based on 61 reviews")).toBeInTheDocument();
  // Прежние 4.6 и 2 300 не должны выжить нигде на странице.
  expect(screen.queryByText("4.6")).not.toBeInTheDocument();
  expect(screen.queryByText(/2,300/)).not.toBeInTheDocument();
});

it("проценты в разбивке дают ровно 100", async () => {
  mocked.mockResolvedValue(
    summary({ average: 4.147, count: 61, distribution: { "5": 23, "4": 26, "3": 10, "2": 2 } })
  );
  const { container } = show();

  await screen.findByText("4.1");
  const values = Array.from(container.querySelectorAll(".about-breakdown-value")).map((node) =>
    Number(node.textContent!.replace("%", ""))
  );
  expect(values).toHaveLength(5);
  expect(values.reduce((sum, value) => sum + value, 0)).toBe(100);
});

it("на малом числе отзывов среднее не показывается", async () => {
  mocked.mockResolvedValue(summary({ average: 5, count: 3, distribution: { "5": 3 } }));
  show();

  expect(await screen.findByText("Not enough reviews yet")).toBeInTheDocument();
  expect(screen.queryByText("5.0")).not.toBeInTheDocument();
});

it("без отзывов зовёт написать первый, а не рисует ноль из пяти", async () => {
  mocked.mockResolvedValue(summary());
  show();

  expect(await screen.findByText("No reviews yet")).toBeInTheDocument();
  expect(screen.queryByText("0.0")).not.toBeInTheDocument();
});

it("сводка не ответила — страница живёт и ведёт себя как при нуле отзывов", async () => {
  mocked.mockRejectedValue(new Error("network is down"));
  show();

  expect(await screen.findByText("No reviews yet")).toBeInTheDocument();
  expect(screen.getByText("About Us")).toBeInTheDocument();
});

it("свежие отзывы показаны со ссылкой на игру — число можно проверить", async () => {
  mocked.mockResolvedValue(
    summary({
      average: 4.5,
      count: 40,
      distribution: { "5": 30, "4": 10 },
      quotes: [
        {
          author: "Rafael C.",
          rating: 5,
          text: "Third playthrough and still finding things.",
          verifiedPurchase: true,
          createdAt: "2026-08-08T03:42:14.337Z",
          avatarUrl: null,
          gameTitle: "Baba Is You",
          gameSlug: "baba-is-you",
        },
      ],
    })
  );
  show();

  expect(await screen.findByText(/Third playthrough/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Baba Is You" })).toHaveAttribute("href", "/games/baba-is-you");
});

it("заявление о проверке заменено на правило, которое сервер применяет", async () => {
  mocked.mockResolvedValue(summary({ average: 4.5, count: 40, distribution: { "5": 40 } }));
  show();

  await screen.findByText("4.5");
  expect(screen.getByText("Buyers only")).toBeInTheDocument();
  expect(screen.queryByText(/Real customers\. Real feedback\./)).not.toBeInTheDocument();
});

it("до ответа сервера вместо оценки стоит заглушка, а не ноль", async () => {
  let resolve: (value: SiteReviewSummary) => void = () => undefined;
  mocked.mockReturnValue(new Promise<SiteReviewSummary>((done) => { resolve = done; }));
  const { container } = show();

  expect(container.querySelector(".about-score-loading")).toBeInTheDocument();
  expect(screen.queryByText("0.0")).not.toBeInTheDocument();

  resolve(summary({ average: 4.5, count: 40, distribution: { "5": 40 } }));
  await waitFor(() => expect(container.querySelector(".about-score-loading")).not.toBeInTheDocument());
});

it("плитки масштаба берутся с сервера, а не вписаны в разметку", async () => {
  mocked.mockResolvedValue(summary());
  mockedStats.mockResolvedValue(
    aboutStats({ foundedYear: 2024, gamesInCatalog: 5231, countriesServed: 12, keysDelivered: 48912 })
  );
  const { container } = show();

  expect(await screen.findByText("5,231")).toBeInTheDocument();
  expect(screen.getByText("Games in the catalog")).toBeInTheDocument();
  expect(screen.getByText("48,912")).toBeInTheDocument();
  // Год ищем внутри блока плиток: на странице есть и другие годы.
  const tiles = container.querySelector(".about-purpose-stats")!;
  expect(tiles.textContent).toContain("2024");
  expect(tiles.textContent).toContain("Founded");
  // Прежние выдуманные значения не должны остаться нигде.
  expect(screen.queryByText("5,000+")).not.toBeInTheDocument();
  expect(screen.queryByText("50k+")).not.toBeInTheDocument();
  expect(screen.queryByText("40+")).not.toBeInTheDocument();
});

it("у молодого магазина слабые цифры просто не показываются", async () => {
  mocked.mockResolvedValue(summary());
  mockedStats.mockResolvedValue(aboutStats({ gamesInCatalog: 52, keysDelivered: 77, countriesServed: 1 }));
  show();

  expect(await screen.findByText("52")).toBeInTheDocument();
  expect(screen.queryByText("77")).not.toBeInTheDocument();
  expect(screen.queryByText("Countries served")).not.toBeInTheDocument();
});

it("время ответа — медиана по обращениям, а не константа", async () => {
  mocked.mockResolvedValue(summary());
  mockedStats.mockResolvedValue(aboutStats({ supportMedianMinutes: 12, supportSampleSize: 40 }));
  show();

  expect(await screen.findByText("12 min")).toBeInTheDocument();
  expect(screen.getByText("Median first reply")).toBeInTheDocument();
  expect(screen.queryByText("Under 5 minutes")).not.toBeInTheDocument();
});

it("на малой выборке строку времени ответа не показываем", async () => {
  mocked.mockResolvedValue(summary());
  mockedStats.mockResolvedValue(aboutStats({ supportMedianMinutes: 2, supportSampleSize: 3 }));
  show();

  await screen.findByText("Delivery");
  expect(screen.queryByText("Median first reply")).not.toBeInTheDocument();
});

it("сервер не ответил — страница цела, плиток нет", async () => {
  mocked.mockResolvedValue(summary());
  mockedStats.mockRejectedValue(new Error("network is down"));
  show();

  expect(await screen.findByText("About Us")).toBeInTheDocument();
  expect(screen.queryByText("Games in the catalog")).not.toBeInTheDocument();
});

it("выдуманных сотрудников на странице не осталось", async () => {
  mocked.mockResolvedValue(summary());
  show();

  await screen.findByText("About Us");
  for (const ghost of ["Alex Carter", "Jamie Lee", "Morgan Patel", "Taylor Smith"]) {
    expect(screen.queryByText(ghost)).not.toBeInTheDocument();
  }
  expect(screen.queryByText("Meet the team")).not.toBeInTheDocument();
});

it("команда приходит с сервера, буква аватара — из имени", async () => {
  mocked.mockResolvedValue(summary());
  mockedTeam.mockResolvedValue([
    { name: "Sam Rivera", role: "Founder", description: "Runs the shop.", badge: "Support", photoUrl: "" },
  ]);
  show();

  expect(await screen.findByText("Sam Rivera")).toBeInTheDocument();
  expect(screen.getByText("Founder")).toBeInTheDocument();
  expect(screen.getByText("Meet the team")).toBeInTheDocument();
  // Буква кружка берётся из имени, а не хранится отдельно.
  expect(screen.getByText("S")).toBeInTheDocument();
});

it("есть фотография — показываем её вместо буквы", async () => {
  mocked.mockResolvedValue(summary());
  mockedTeam.mockResolvedValue([
    { name: "Sam Rivera", role: "Founder", description: "", badge: "", photoUrl: "/uploads/images/sam.png" },
  ]);
  const { container } = show();

  await screen.findByText("Sam Rivera");
  const photo = container.querySelector(".about-team-avatar img") as HTMLImageElement | null;
  expect(photo).not.toBeNull();
  expect(photo!.getAttribute("src")).toContain("/uploads/images/sam.png");
  // Буква и фотография одновременно — это две разные подписи на одном кружке.
  expect(screen.queryByText("S")).not.toBeInTheDocument();
});

it("пустые поля не рисуют пустых строк в карточке", async () => {
  mocked.mockResolvedValue(summary());
  mockedTeam.mockResolvedValue([{ name: "Sam Rivera", role: "", description: "", badge: "", photoUrl: "" }]);
  const { container } = show();

  await screen.findByText("Sam Rivera");
  expect(container.querySelector(".about-team-badge")).toBeNull();
});

it("рисунок в панели есть при любом числе цифр", async () => {
  mocked.mockResolvedValue(summary());
  mockedStats.mockResolvedValue(aboutStats({ gamesInCatalog: 52, genresInCatalog: 12, activationRegions: 9 }));
  const { container } = show();

  await screen.findByText("52");
  // Раньше он рисовался только когда плиток было мало и исчезал, стоило добавить третью.
  expect(container.querySelector(".about-purpose-art")).toBeInTheDocument();
  expect(container.querySelectorAll(".about-purpose-stat")).toHaveLength(3);
});

it("панель та же самая, когда цифр много", async () => {
  mocked.mockResolvedValue(summary());
  mockedStats.mockResolvedValue(
    aboutStats({ foundedYear: 2024, gamesInCatalog: 500, genresInCatalog: 12, activationRegions: 9, countriesServed: 12, keysDelivered: 9000 })
  );
  const { container } = show();

  await screen.findByText("500");
  expect(container.querySelector(".about-purpose-art")).toBeInTheDocument();
  expect(container.querySelectorAll(".about-purpose-stat")).toHaveLength(6);
});

it("три блока — mission, vision и promise", async () => {
  mocked.mockResolvedValue(summary());
  show();

  expect(await screen.findByText("Mission")).toBeInTheDocument();
  expect(screen.getByText("Vision")).toBeInTheDocument();
  expect(screen.getByText("Promise")).toBeInTheDocument();
});
