import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '../../components/ui/ToastProvider';
import DemoLayer from './DemoLayer';
import DemoTestCardHint from './DemoTestCardHint';
import { DEMO_EVENT } from './demoEvents';

const mockGetConfig = jest.fn();
jest.mock('./demoApi', () => ({
  ...jest.requireActual('./demoEvents'),
  getDemoConfig: () => mockGetConfig(),
}));
// Настройки демо кэшируются на вкладку; в тестах — свежие на каждый рендер.
jest.mock('./useDemoConfig', () => {
  const React = jest.requireActual('react');
  const load = () => mockGetConfig().catch(() => ({ enabled: false }));
  return {
    loadDemoConfig: load,
    useDemoConfig: () => {
      const [config, setConfig] = React.useState(null);
      React.useEffect(() => {
        load().then(setConfig);
      }, []);
      return config;
    },
  };
});
const mockKeycloak = { authenticated: false, login: jest.fn(), register: jest.fn() };
jest.mock('@react-keycloak/web', () => ({
  useKeycloak: () => ({ keycloak: mockKeycloak, initialized: true }),
}));

const renderLayer = () =>
  render(
    <ToastProvider>
      <DemoLayer />
    </ToastProvider>
  );

const demoConfig = { enabled: true, accounts: [{ role: 'admin', username: 'demo-admin', password: 'demo-pass' }] };

beforeEach(() => {
  mockGetConfig.mockReset();
  mockKeycloak.authenticated = false;
  mockKeycloak.login.mockReset();
  mockKeycloak.register.mockReset();
  sessionStorage.clear();
  localStorage.clear();
});

/**
 * Демо-слой: на обычном магазине его нет; на демо — приглашение (зарегистрироваться и купить тестовой картой,
 * админка — демо-админом «только просмотр»), кружок «Демо» с панелью и пояснение к отказам сервера.
 */
it('renders nothing on a regular store', async () => {
  mockGetConfig.mockResolvedValue({ enabled: false });
  const { container } = renderLayer();
  await act(async () => undefined);
  expect(container.querySelector('.demo-fab')).toBeNull();
});

it('invites to create an own account and shows the view-only admin and the test card', async () => {
  mockGetConfig.mockResolvedValue(demoConfig);
  renderLayer();

  expect(await screen.findByText('This is a demo store')).toBeInTheDocument();
  expect(screen.getByText('demo-admin')).toBeInTheDocument();
  expect(screen.getByText('Administrator · view only')).toBeInTheDocument();
  expect(screen.getByText('4242 4242 4242 4242')).toBeInTheDocument();
  expect(screen.queryByText(/Open my copy/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
  expect(mockKeycloak.register).toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Sign in as admin' }));
  expect(mockKeycloak.login).toHaveBeenCalledWith(expect.objectContaining({ loginHint: 'demo-admin' }));
});

it('folds the invitation into the demo circle, which opens the accounts again', async () => {
  mockGetConfig.mockResolvedValue(demoConfig);
  renderLayer();
  await screen.findByText('This is a demo store');

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText('This is a demo store')).toBeNull();
  expect(sessionStorage.getItem('demo-welcome-seen')).toBe('1');

  const fab = screen.getByRole('button', { name: 'Demo: accounts and test card' });
  expect(fab).toHaveClass('is-pulsing');
  fireEvent.click(fab);
  expect(fab).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('demo-admin')).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByText('demo-admin')).toBeNull();
});

it('does not repeat the invitation in the same tab and hides sign-up for a signed-in visitor', async () => {
  sessionStorage.setItem('demo-welcome-seen', '1');
  mockKeycloak.authenticated = true;
  mockGetConfig.mockResolvedValue(demoConfig);
  renderLayer();

  fireEvent.click(await screen.findByRole('button', { name: 'Demo: accounts and test card' }));
  expect(screen.queryByText('This is a demo store')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create my account' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign in as admin' })).toBeNull();
});

it('explains a view-only refusal instead of showing a bare error', async () => {
  sessionStorage.setItem('demo-welcome-seen', '1');
  mockGetConfig.mockResolvedValue(demoConfig);
  renderLayer();
  await screen.findByRole('button', { name: 'Demo: accounts and test card' });

  act(() => {
    window.dispatchEvent(new CustomEvent(DEMO_EVENT, { detail: { code: 'demo_readonly' } }));
  });
  expect(await screen.findByText(/admin account is view-only/)).toBeInTheDocument();
});

it('shows the hint next to the demo circle only once per browser', async () => {
  sessionStorage.setItem('demo-welcome-seen', '1');
  mockGetConfig.mockResolvedValue(demoConfig);
  const first = renderLayer();
  const hint = await screen.findByText(/all here/);
  fireEvent.click(hint);
  expect(screen.getByText('demo-admin')).toBeInTheDocument();
  first.unmount();

  renderLayer();
  await screen.findByRole('button', { name: 'Demo: accounts and test card' });
  expect(screen.queryByText(/all here/)).toBeNull();
});

it('shows the test card above the payment form only on the demo', async () => {
  mockGetConfig.mockResolvedValue(demoConfig);
  const { unmount } = render(<DemoTestCardHint />);
  expect(await screen.findByText(/pay with the test card/)).toBeInTheDocument();
  expect(screen.getByText('4242 4242 4242 4242')).toBeInTheDocument();  unmount();

  mockGetConfig.mockResolvedValue({ enabled: false });
  const { container } = render(<DemoTestCardHint />);
  await act(async () => undefined);
  expect(container).toBeEmptyDOMElement();
});
