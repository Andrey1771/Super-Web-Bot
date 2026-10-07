import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DlcManager from './DlcManager';

const mockGet = jest.fn();
const mockCreate = jest.fn();
const mockDetach = jest.fn();
const mockToast = jest.fn();
const mockQuickEdit = jest.fn();
const mockDelete = jest.fn();
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));
jest.mock('../../api/adminDlcApi', () => ({
  deleteDlcProduct: (...args: unknown[]) => mockDelete(...args),
  getGameDlc: (...args: unknown[]) => mockGet(...args),
  createGameDlc: (...args: unknown[]) => mockCreate(...args),
  attachGameDlc: jest.fn(),
  detachGameDlc: (...args: unknown[]) => mockDetach(...args),
  quickEditGameDlc: (...args: unknown[]) => mockQuickEdit(...args),
}));
jest.mock('../../components/admin/KeyInventorySection', () => ({ __esModule: true, default: () => <div>keys panel</div> }));
jest.mock('../../components/ui/ToastProvider', () => ({ useToast: () => ({ addToast: mockToast }) }));
jest.mock('./GameSwitcher', () => ({ __esModule: true, default: () => <div>search</div> }));
jest.mock('../../utils/format-money', () => ({ formatMoney: (value: number) => `$${value.toFixed(2)}` }));

/** DLC игры в редакторе карточки: список дополнений (с черновиками), создание черновиком, отвязка с подтверждением. */

const row = (id: string, extra = {}) => ({
  id, slug: id, title: `DLC ${id}`, imagePath: '', price: 9.99, currency: 'USD', isDraft: false, isComingSoon: false,
  keysAvailable: 3, releaseDate: '2026-01-01', ...extra,
});

const renderManager = (onCountChange = jest.fn(), onCurrentSaved?: () => void) =>
  render(
    <MemoryRouter>
      <DlcManager gameId="game-1" gameTitle="XCOM 2" onCountChange={onCountChange} onCurrentSaved={onCurrentSaved} />
    </MemoryRouter>
  );

beforeEach(() => {
  [mockGet, mockCreate, mockDetach, mockToast, mockQuickEdit, mockDelete, mockNavigate].forEach((fn) => fn.mockReset());
});

it('lists the add-ons with their state and reports how many there are', async () => {
  mockGet.mockResolvedValue({ kind: 'Game', parent: null, items: [row('a'), row('b', { isDraft: true, keysAvailable: 0 })] });
  const onCount = jest.fn();
  renderManager(onCount);

  expect(await screen.findByText('DLC a')).toBeInTheDocument();
  expect(screen.getByText('Draft')).toBeInTheDocument();
  expect(screen.getByText('No keys')).toBeInTheDocument();
  expect(onCount).toHaveBeenCalledWith(2);
});

it('creates a draft DLC for this game', async () => {
  mockGet.mockResolvedValue({ kind: 'Game', parent: null, items: [] });
  mockCreate.mockResolvedValue({ id: 'new', slug: 'new', title: 'Season Pass' });
  renderManager();

  await userEvent.click(await screen.findByRole('button', { name: '+ New DLC' }));
  await userEvent.type(screen.getByPlaceholderText('XCOM 2: Season Pass'), 'Season Pass');
  await userEvent.type(screen.getByPlaceholderText('9.99'), '14.99');
  await userEvent.click(screen.getByRole('button', { name: 'Create draft DLC' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('game-1', 'Season Pass', 14.99));
  expect(mockGet).toHaveBeenCalledTimes(2);
});

it('asks before detaching', async () => {
  mockGet.mockResolvedValue({ kind: 'Game', parent: null, items: [row('a')] });
  mockDetach.mockResolvedValue(undefined);
  renderManager();

  await userEvent.click(await screen.findByText('DLC a'));
  await userEvent.click(screen.getByRole('button', { name: 'Detach from the game' }));
  expect(mockDetach).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Yes, detach' }));

  await waitFor(() => expect(mockDetach).toHaveBeenCalledWith('game-1', 'a'));
});

it('deletes a DLC after confirmation', async () => {
  mockGet.mockResolvedValue({ kind: 'Game', parent: null, items: [row('a')] });
  mockDelete.mockResolvedValue(undefined);
  renderManager();

  await userEvent.click(await screen.findByText('DLC a'));
  await userEvent.click(screen.getByRole('button', { name: 'Delete DLC' }));
  expect(mockDelete).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a'));
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('leaves for the game card after deleting the DLC that is open', async () => {
  const parentMode = { kind: 'Game', parent: { id: 'base', title: 'Crimson Desert', slug: 'cd' }, items: [] };
  const siblings = { kind: 'Game', parent: null, items: [row('game-1', { title: 'Copy' })] };
  mockGet.mockImplementation((id: string) => Promise.resolve(id === 'base' ? siblings : parentMode));
  mockDelete.mockResolvedValue(undefined);
  renderManager();

  await userEvent.click(await screen.findByText('Copy'));
  await userEvent.click(screen.getByRole('button', { name: 'Delete DLC' }));
  await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/games/base/edit'));
});

it('shows the base game when the product is itself a DLC', async () => {
  mockGet.mockResolvedValue({ kind: 'Game', parent: { id: 'base', title: 'XCOM 2', slug: 'xcom-2' }, items: [] });
  renderManager();

  expect(await screen.findByRole('link', { name: 'XCOM 2' })).toHaveAttribute('href', '/admin/games/base/edit');
  expect(screen.queryByRole('button', { name: '+ New DLC' })).not.toBeInTheDocument();
});

it('lists all DLC of the same game when the product is a DLC, marking this one', async () => {
  mockGet
    .mockResolvedValueOnce({ kind: 'Game', parent: { id: 'base', title: 'Crimson Desert', slug: 'cd' }, items: [] })
    .mockResolvedValueOnce({ kind: 'Game', parent: null, items: [row('game-1', { title: 'Charting the Unknown' }), row('other', { title: 'Soundtrack' })] });
  renderManager();

  expect(await screen.findByText('All DLC of Crimson Desert (2)')).toBeInTheDocument();
  expect(screen.getByText('open now')).toBeInTheDocument();
  expect(screen.getByText('Soundtrack')).toBeInTheDocument();
  expect(mockGet).toHaveBeenLastCalledWith('base');
});

it('edits the open DLC in its row too and tells the card to refresh those fields', async () => {
  const parentMode = { kind: 'Game', parent: { id: 'base', title: 'Crimson Desert', slug: 'cd' }, items: [] };
  const siblings = { kind: 'Game', parent: null, items: [row('game-1', { title: 'Deluxe Pack', price: 12.99 })] };
  mockGet.mockImplementation((id: string) => Promise.resolve(id === 'base' ? siblings : parentMode));
  mockQuickEdit.mockResolvedValue(undefined);
  const onCurrentSaved = jest.fn();
  renderManager(jest.fn(), onCurrentSaved);

  await userEvent.click(await screen.findByText('Deluxe Pack'));
  const price = screen.getByLabelText('Price, USD');
  await userEvent.clear(price);
  await userEvent.type(price, '9.99');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  // Правка идёт через игру-родителя, а карточка открытого DLC подтягивает сохранённое — её «Save all» не затрёт правку.
  await waitFor(() => expect(mockQuickEdit).toHaveBeenCalledWith('base', 'game-1', { price: 9.99 }));
  await waitFor(() => expect(onCurrentSaved).toHaveBeenCalled());
});

it('opens a DLC in place and saves only what changed', async () => {
  mockGet.mockResolvedValue({ kind: 'Game', parent: null, items: [row('a', { title: 'Season Pass', price: 9.99, isDraft: true })] });
  mockQuickEdit.mockResolvedValue(undefined);
  renderManager();

  await userEvent.click(await screen.findByText('Season Pass'));
  const price = screen.getByLabelText('Price, USD');
  await userEvent.clear(price);
  await userEvent.type(price, '14.99');
  await userEvent.click(screen.getByRole('radio', { name: 'Published' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(mockQuickEdit).toHaveBeenCalledWith('game-1', 'a', { price: 14.99, isDraft: false }));
  expect(screen.getByRole('link', { name: /Full editor/ })).toHaveAttribute('href', '/admin/games/a/edit');

  await userEvent.click(screen.getByRole('button', { name: 'Manage keys' }));
  expect(screen.getByText('keys panel')).toBeInTheDocument();
});
