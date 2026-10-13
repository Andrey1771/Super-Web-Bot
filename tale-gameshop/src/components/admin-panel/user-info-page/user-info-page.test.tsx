import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminHeaderContext } from "../../layout/AdminHeaderContext";
import { ToastProvider } from "../../ui/ToastProvider";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import UserInfoPage from "./user-info-page";

/**
 * Журнал входов.
 *
 * Страница уже ломалась молча: флаг загрузки остался от прежней «загрузки одним запросом»,
 * снимать его после перехода на грид стало некому — экран навсегда застревал на скелете, а
 * кнопка Refresh оставалась заблокированной. Ни компилятор, ни сборка такого не видят,
 * поэтому проверяем то, что видит человек: появились ли строки.
 */

const mockGetLoginEventsPage = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLoginEventsPage.mockResolvedValue([
    {
      time: "2026-09-01T10:00:00Z",
      type: "LOGIN",
      userId: "u1",
      username: "admin@taleshop.test",
      clientId: "tale-shop",
      ipAddress: "127.0.0.1",
      details: { auth_method: "openid-connect", redirect_uri: "http://localhost/admin/userInfo" },
    },
  ]);

  // Сервис берётся из контейнера — подменяем его на время теста.
  if (container.isBound(IDENTIFIERS.IAdminService)) {
    container.unbind(IDENTIFIERS.IAdminService);
  }
  container.bind(IDENTIFIERS.IAdminService).toConstantValue({
    getLoginEventsPage: (...args: unknown[]) => mockGetLoginEventsPage(...args),
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <AdminHeaderContext.Provider value={{ title: "", setPageTitle: () => undefined }}>
          <UserInfoPage />
        </AdminHeaderContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );

test("журнал показывает события, а не вечный скелет", async () => {
  renderPage();

  await waitFor(() => expect(mockGetLoginEventsPage).toHaveBeenCalled(), { timeout: 5000 });
  expect(await screen.findByText("admin@taleshop.test", {}, { timeout: 5000 })).toBeInTheDocument();
});

test("кнопка обновления доступна", async () => {
  renderPage();

  await waitFor(() => expect(mockGetLoginEventsPage).toHaveBeenCalled(), { timeout: 5000 });
  // Раньше она была заблокирована навсегда: её блокировал тот самый незакрывающийся флаг.
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
});

test("таблица не перезагружает себя", async () => {
  renderPage();

  await waitFor(() => expect(mockGetLoginEventsPage).toHaveBeenCalled(), { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 700));

  expect(mockGetLoginEventsPage.mock.calls.length).toBeLessThanOrEqual(2);
});

test("карточка события читается: время датой, вложенное — без [object Object]", async () => {
  renderPage();

  await waitFor(() => expect(mockGetLoginEventsPage).toHaveBeenCalled(), { timeout: 5000 });
  await userEvent.click(await screen.findByText("admin@taleshop.test", {}, { timeout: 5000 }));

  expect(await screen.findByText("Login details")).toBeInTheDocument();
  // Раньше сюда попадал сырой объект строки: время числом, вложенный details — «[object Object]».
  expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  expect(screen.getByText("Auth method")).toBeInTheDocument();
});
