import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider } from '../../components/ui/ToastProvider';
import DemoLayer from './DemoLayer';
import { DEMO_EVENT } from './demoEvents';

const mockGetConfig = jest.fn();
jest.mock('./demoApi', () => ({
  ...jest.requireActual('./demoEvents'),
  getDemoConfig: () => mockGetConfig(),
  openDemoSandbox: jest.fn(),
  resetDemoSandbox: jest.fn(),
  getDemoMailbox: () => Promise.resolve([]),
}));
jest.mock('@react-keycloak/web', () => ({
  useKeycloak: () => ({ keycloak: { authenticated: false, login: jest.fn() }, initialized: true }),
}));

const renderLayer = () =>
  render(
    <ToastProvider>
      <DemoLayer />
    </ToastProvider>
  );

beforeEach(() => {
  mockGetConfig.mockReset();
  sessionStorage.clear();
});

/** Демо-слой: на обычном магазине его нет; на демо — полоска, приглашение и пояснения к отказам сервера. */
it('renders nothing on a regular store', async () => {
  mockGetConfig.mockResolvedValue({ enabled: false });
  const { container } = renderLayer();
  await act(async () => undefined);
  expect(container.querySelector('.demo-bar')).toBeNull();
});

it('invites to open an own copy and shows the demo accounts', async () => {
  mockGetConfig.mockResolvedValue({
    enabled: true,
    sandbox: null,
    sandboxHours: 24,
    accounts: [{ role: 'admin', username: 'demo-admin', password: 'demo-pass' }],
  });
  renderLayer();

  expect(await screen.findByText('This is a demo store')).toBeInTheDocument();
  expect(screen.getByText('demo-admin')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Open my copy' }).length).toBeGreaterThan(0);
});

it('shows the time left in an own copy and explains read-only actions', async () => {
  const expiresAt = new Date(Date.now() + (5 * 60 + 30) * 60000 + 20000).toISOString();
  mockGetConfig.mockResolvedValue({ enabled: true, sandbox: { createdAt: new Date().toISOString(), expiresAt }, accounts: [] });
  renderLayer();

  expect(await screen.findByText('Your own copy of the store · 5 h 30 min left')).toBeInTheDocument();

  act(() => {
    window.dispatchEvent(new CustomEvent(DEMO_EVENT, { detail: { code: 'demo_readonly' } }));
  });
  expect(await screen.findByText(/Disabled in the demo/)).toBeInTheDocument();
});
