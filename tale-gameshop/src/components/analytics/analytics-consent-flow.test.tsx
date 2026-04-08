import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AnalyticsProvider from "./AnalyticsProvider";
import CookieBanner from "./CookieBanner";
import TaleGameshopFooter from "../tale-gameshop-footer/tale-gameshop-footer";
import { analyticsClient } from "../../utils/analytics-client";

const getPublicSettings = jest.fn();

jest.mock("../../inversify.config", () => ({
  __esModule: true,
  default: {
    get: () => ({
      getPublicSettings,
    }),
  },
}));

jest.mock("../../utils/analytics-client", () => ({
  analyticsClient: {
    configure: jest.fn(),
    setConsent: jest.fn(),
    initialize: jest.fn(() => Promise.resolve()),
    trackPageView: jest.fn(),
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
    getPublicSettings.mockResolvedValue({ isEnabled: false });
    renderWithProvider();

    await waitFor(() => {
      expect(screen.queryByText("Cookie preferences")).not.toBeInTheDocument();
    });
  });

  it("shows banner when analytics is enabled and consent is missing", async () => {
    getPublicSettings.mockResolvedValue({ isEnabled: true, gaMeasurementId: "G-TEST" });
    renderWithProvider();

    expect(await screen.findByText("Cookie preferences")).toBeInTheDocument();
  });

  it("reject hides banner and keeps scripts disabled", async () => {
    getPublicSettings.mockResolvedValue({ isEnabled: true, gaMeasurementId: "G-TEST" });
    renderWithProvider();

    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(screen.queryByText("Cookie preferences")).not.toBeInTheDocument();
    });

    expect(analyticsClient.initialize).not.toHaveBeenCalled();
  });

  it("accept enables analytics and allows reopening settings with current choice", async () => {
    getPublicSettings.mockResolvedValue({ isEnabled: true, gaMeasurementId: "G-TEST" });
    renderWithProvider();

    await userEvent.click(await screen.findByRole("button", { name: "Accept analytics" }));

    await waitFor(() => {
      expect(screen.queryByText("Cookie preferences")).not.toBeInTheDocument();
    });

    expect(analyticsClient.initialize).toHaveBeenCalledTimes(1);

    await userEvent.click(await screen.findByRole("button", { name: "Cookie settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    const checkbox = screen.getByRole("checkbox", { name: "Optional analytics cookies" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});
