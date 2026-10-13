import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AccountSettingsPage from './AccountSettingsPage';

/**
 * Настройки писем в личном кабинете. Страница за формой входа, вживую её не открыть —
 * поэтому проверяется здесь: галочка «письма о скидках» подчинена самой подписке и
 * уезжает на сервер вместе с ней.
 */

const mockGetMyNewsletter = jest.fn();
const mockSetMyNewsletter = jest.fn();

jest.mock('../../../api/newsletterApi', () => ({
    getMyNewsletter: () => mockGetMyNewsletter(),
    setMyNewsletter: (...args: unknown[]) => mockSetMyNewsletter(...args),
}));

const mockGetTelegramStatus = jest.fn();
jest.mock('../../../api/telegramLinkApi', () => ({
    getTelegramStatus: () => mockGetTelegramStatus(),
    createTelegramLinkToken: jest.fn(),
    unlinkTelegram: jest.fn(),
}));

const mockDownloadDataExport = jest.fn();
jest.mock('../../../api/billing-api', () => ({
    downloadDataExport: () => mockDownloadDataExport(),
}));

jest.mock('../../../api/accountApi', () => ({
    fetchAccountProfile: jest.fn(),
    saveAccountProfile: jest.fn(),
}));

jest.mock('../context/AccountProfileContext', () => ({
    useAccountProfile: () => ({
        profile: { displayName: 'Tester', email: 'tester@test.dev', avatarUrl: null },
        updateAvatar: jest.fn(),
    }),
}));

jest.mock('../../../components/ui/ToastProvider', () => ({
    useToast: () => ({ addToast: jest.fn() }),
}));

// Вошёл ли общий демо-админ: по умолчанию — обычный покупатель.
const mockIsDemoViewer = jest.fn(() => false);
jest.mock('../../demo/useDemoConfig', () => ({
    useIsDemoViewer: () => mockIsDemoViewer(),
}));

jest.mock('../components/AccountShell', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const renderPage = () => render(
    <MemoryRouter>
        <AccountSettingsPage />
    </MemoryRouter>,
);

const newsletterBox = () => screen.getByLabelText(/Newsletter — news/);
const priceDropsBox = () => screen.getByLabelText(/Price drops/) as HTMLInputElement;

beforeEach(() => {
    jest.clearAllMocks();
    mockIsDemoViewer.mockReturnValue(false);
    localStorage.clear();
    mockGetTelegramStatus.mockResolvedValue({ linked: false });
    mockSetMyNewsletter.mockResolvedValue({ subscribed: true, status: 'confirmed', dealAlerts: true });
});

it('shows the deal-alerts choice the server has on file', async () => {
    mockGetMyNewsletter.mockResolvedValue({ subscribed: true, status: 'confirmed', dealAlerts: false });

    renderPage();

    await waitFor(() => expect(priceDropsBox().checked).toBe(false));
});

it('saves the subscription and the deal-alerts choice together', async () => {
    mockGetMyNewsletter.mockResolvedValue({ subscribed: true, status: 'confirmed', dealAlerts: true });

    renderPage();
    await waitFor(() => expect(priceDropsBox().checked).toBe(true));

    await userEvent.click(priceDropsBox());
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(mockSetMyNewsletter).toHaveBeenCalledWith(true, false));
});

it('locks the deal-alerts choice while the newsletter itself is off', async () => {
    mockGetMyNewsletter.mockResolvedValue({ subscribed: false, status: 'unsubscribed', dealAlerts: true });

    renderPage();

    // Настройка про одну из рассылок: без самой подписки выбирать нечего.
    await waitFor(() => expect(priceDropsBox()).toBeDisabled());
    expect(priceDropsBox().checked).toBe(false);

    await userEvent.click(newsletterBox());
    expect(priceDropsBox()).toBeEnabled();
    expect(priceDropsBox().checked).toBe(true);
});

/** Telegram — строка интеграции: не подключён — плашка и «Connect»; подключён — @имя, «Connected», «Disconnect». */
it('shows the Telegram integration row in both states', async () => {
    renderPage();
    const row = await screen.findByTestId('settings-telegram');
    expect(row).toHaveTextContent('Not connected');
    expect(screen.getByRole('button', { name: 'Connect Telegram' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
});

it('tells the demo admin that Telegram is closed to him instead of failing on click', async () => {
    mockIsDemoViewer.mockReturnValue(true);
    renderPage();
    const row = await screen.findByTestId('settings-telegram');
    expect(screen.getByRole('button', { name: 'Connect Telegram' })).toBeDisabled();
    expect(row).toHaveTextContent("The demo admin can't connect Telegram");
});

it('names the linked Telegram account and offers to disconnect', async () => {
    mockGetTelegramStatus.mockResolvedValue({ linked: true, username: 'andrey' });
    renderPage();
    const row = await screen.findByTestId('settings-telegram');
    await waitFor(() => expect(row).toHaveTextContent('@andrey'));
    expect(row).toHaveTextContent('Connected');
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Telegram' })).toBeNull();
});

it('downloads the account data archive from the account & security list', async () => {
    mockGetMyNewsletter.mockResolvedValue({ subscribed: false, status: 'none', dealAlerts: false });
    mockDownloadDataExport.mockResolvedValue(new Blob(['zip']));
    const createUrl = jest.fn(() => 'blob:export');
    Object.assign(window.URL, { createObjectURL: createUrl, revokeObjectURL: jest.fn() });

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Download my data/ }));

    await waitFor(() => expect(mockDownloadDataExport).toHaveBeenCalledTimes(1));
    expect(createUrl).toHaveBeenCalled();
});
