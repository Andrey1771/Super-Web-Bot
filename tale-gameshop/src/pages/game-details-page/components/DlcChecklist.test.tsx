import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DlcProduct } from '../../../types/game-details';
import DlcChecklist, { DLC_VISIBLE_ROWS } from './DlcChecklist';

const mockDispatch = jest.fn();
let mockCartItems: Array<{ gameId: string }> = [];
jest.mock('../../../context/cart-context', () => ({ useCart: () => ({ state: { items: mockCartItems }, dispatch: mockDispatch }) }));
jest.mock('../../../context/site-preferences', () => ({ useSitePreferences: () => ({ currency: 'USD' }) }));
jest.mock('../../../utils/format-money', () => ({ formatMoney: (value: number) => `$${value.toFixed(2)}` }));

/**
 * DLC на странице игры — список с галочками: отмеченные складываются в сумму и кладутся в корзину
 * одной кнопкой. Купленное, лежащее в корзине, невышедшее и кончившееся выбрать нельзя.
 */

const dlc = (id: string, price: number | null, extra: Partial<DlcProduct> = {}): DlcProduct => ({
  id,
  slug: id,
  title: `DLC ${id}`,
  coverUrl: `/uploads/${id}.png`,
  releaseDate: '2016-05-12T00:00:00Z',
  inStock: true,
  pricing: price == null ? null : { price, currency: 'USD' },
  ...extra,
});

const renderList = (products: DlcProduct[]) =>
  render(
    <MemoryRouter>
      <DlcChecklist products={products} legacy={[]} />
    </MemoryRouter>,
  );

beforeEach(() => {
  mockDispatch.mockClear();
  mockCartItems = [];
});

it('sums the ticked add-ons and puts them in the cart together', async () => {
  renderList([dlc('a', 39.99), dlc('b', 17.49), dlc('c', 9.99)]);
  const add = screen.getByRole('button', { name: 'Add selected to cart' });
  expect(add).toBeDisabled();

  await userEvent.click(screen.getByRole('checkbox', { name: 'Select DLC a' }));
  await userEvent.click(screen.getByText('DLC b').closest('label')!.querySelector('.dlc-row__date')!);

  expect(screen.getByText(/2 selected/)).toHaveTextContent('$57.48');
  await userEvent.click(add);

  expect(mockDispatch.mock.calls.map(([action]) => [action.type, action.payload.gameId, action.payload.price])).toEqual([
    ['ADD_TO_CART', 'a', 39.99],
    ['ADD_TO_CART', 'b', 17.49],
  ]);
  expect(add).toBeDisabled();
});

it('does not let the buyer pick what they own, already carry, cannot get yet or is sold out', () => {
  mockCartItems = [{ gameId: 'cart' }];
  renderList([
    dlc('owned', 9.99, { owned: true }),
    dlc('cart', 9.99),
    dlc('soon', 9.99, { isComingSoon: true }),
    dlc('out', 9.99, { inStock: false }),
    dlc('free', 4.99),
  ]);

  expect(screen.getByRole('checkbox', { name: 'Select DLC owned' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Select DLC cart' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Select DLC cart' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Select DLC soon' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Select DLC out' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Select DLC free' })).toBeEnabled();

  const owned = screen.getByText('DLC owned').closest('label')!;
  expect(within(owned).getByText('You own this')).toBeInTheDocument();
  expect(within(owned).queryByText('$9.99')).not.toBeInTheDocument();
  expect(within(screen.getByText('DLC out').closest('label')!).getByText('Out of stock')).toBeInTheDocument();
  // Выбирать «все» из одного доступного незачем.
  expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();
});

it('selects and clears everything that can be bought', async () => {
  renderList([dlc('a', 10), dlc('b', 5), dlc('owned', 3, { owned: true })]);

  await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
  expect(screen.getByText(/2 selected/)).toHaveTextContent('$15.00');

  await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('button', { name: 'Add selected to cart' })).toBeDisabled();
});

it('shows the first rows and opens the rest on demand', async () => {
  const many = Array.from({ length: DLC_VISIBLE_ROWS + 3 }, (_, index) => dlc(`n${index}`, 1));
  renderList(many);
  expect(screen.getAllByRole('checkbox')).toHaveLength(DLC_VISIBLE_ROWS);

  await userEvent.click(screen.getByRole('button', { name: `Show all ${many.length}` }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(many.length);
});

it('links each add-on to its own page', () => {
  renderList([dlc('war-of-the-chosen', 39.99)]);
  expect(screen.getByRole('link', { name: 'DLC war-of-the-chosen' })).toHaveAttribute('href', '/games/war-of-the-chosen');
});
