import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AnalyticsProvider from "./AnalyticsProvider";
import CookieBanner from "./CookieBanner";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import { analyticsClient } from "../../utils/analytics-client";

// Префикс mock обязателен: jest.mock() поднимается в начало файла, и его фабрике разрешено
// обращаться только к таким переменным.
const mockGetPublicSettings = jest.fn();

// Провайдер аналитики просит у контейнера и настройки, и сервис Keycloak: подписывается на
// вход и выход, чтобы проставлять и сбрасывать идентификатор пользователя. Отдаём один объект,
// который умеет и то, и другое, — иначе get() возвращает заглушку без нужной половины.
const mockKeycloakService = {
  keycloak: { tokenParsed: undefined as { sub?: string } | undefined },
  stateChangedEmitter: { on: jest.fn(), off: jest.fn() },
};

jest.mock("../../inversify.config", () => ({
  __esModule: true,
  default: {
    get: () => ({
      getPublicSettings: mockGetPublicSettings,
      ...mockKeycloakService,
    }),
  },
}));


jest.mock("../../utils/analytics-client", () => ({
  analyticsClient: {
    configure: jest.fn(),
    setConsent: jest.fn(),
    initialize: jest.fn(() => Promise.resolve()),
    trackPageView: jest.fn(),
    // Идентификатор пользователя провайдер проставляет при входе и сбрасывает при выходе:
    // без этой заглушки тест падал бы на том, что в коде появилось после его написания.
    setUserId: jest.fn(),
  },
}));

const renderWithProvider = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <AnalyticsProvider isAdminRoute={false}>
        <CookieBanner />
        <TaleGameshopFooter />
      </AnalyticsProvider>
    </MemoryRouter>,
  );

describe("analytics consent flow", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("hides banner when analytics is disabled", async () => {
    mockGetPublicSettings.mockResolvedValue({ isEnabled: false });
    renderWithProvider();

    await waitFor(() => {
      expect(screen.queryByText("Cookie preferences")).not.toBeInTheDocument();
    });
  });

  it("shows banner when analytics is enabled and consent is missing", async () => {
    mockGetPublicSettings.mockResolvedValue({ isEnabled: true, gaMeasurementId: "G-TEST" });
    renderWithProvider();

    expect(await screen.findByText("Cookie preferences")).toBeInTheDocument();
  });

  it("reject hides banner and keeps scripts disabled", async () => {
    mockGetPublicSettings.mockResolvedValue({ isEnabled: true, gaMeasurementId: "G-TEST" });
    renderWithProvider();

    // «Necessary only» — это и есть отказ: обязательные cookie остаются, аналитика нет.
    // Кнопка называется так же, как у крупных магазинов, и означает решение в один клик.
    await userEvent.click(await screen.findByRole("button", { name: "Necessary only" }));

    await waitFor(() => {
      expect(screen.queryByText("Cookie preferences")).not.toBeInTheDocument();
    });

    expect(analyticsClient.initialize).not.toHaveBeenCalled();
  });

  it("accept enables analytics and allows reopening settings with current choice", async () => {
    mockGetPublicSettings.mockResolvedValue({ isEnabled: true, gaMeasurementId: "G-TEST" });
    renderWithProvider();

    await userEvent.click(await screen.findByRole("button", { name: "Accept analytics" }));

    await waitFor(() => {
      expect(screen.queryByText("Cookie preferences")).not.toBeInTheDocument();
    });

    expect(analyticsClient.initialize).toHaveBeenCalledTimes(1);

    // «Cookie settings» в подвале открывает панель настроек сразу. Второй клик по «Settings»
    // внутри баннера её бы закрыл — эта кнопка переключатель, а не повторное открытие.
    await userEvent.click(await screen.findByRole("button", { name: "Cookie settings" }));

    // Галочку проставляет эффект по изменившемуся согласию, а он прилетает отдельным
    // обновлением: ждём его, а не читаем DOM в тот же миг.
    const checkbox = (await screen.findByRole("checkbox", { name: "Optional analytics cookies" })) as HTMLInputElement;
    await waitFor(() => expect(checkbox.checked).toBe(true));
  });
});
