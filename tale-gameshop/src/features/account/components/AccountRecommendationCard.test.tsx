import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Game } from '../../../models/game';
import AccountRecommendationCard from './AccountRecommendationCard';

const mockDispatch = jest.fn();
jest.mock('../../../context/cart-context', () => ({ useCart: () => ({ dispatch: mockDispatch }) }));
jest.mock('../../../context/site-preferences', () => ({ useSitePreferences: () => ({ currency: 'USD' }) }));
jest.mock('../../../components/common/HoverTrailer', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../utils/format-money', () => ({ formatMoney: (value: number) => `$${value.toFixed(2)}` }));

/** Рекомендация в кабинете: карточка ведёт на игру, кнопка кладёт в корзину ту цену, что на карточке. */
const game = { id: 'g1', slug: 'xcom-2', title: 'XCOM 2', name: 'XCOM 2', price: 59.99, finalPrice: 11.99, currency: 'USD', imagePath: '/c.webp' } as Game;

const renderCard = (overrides: Partial<Game> = {}) =>
  render(
    <MemoryRouter>
      <AccountRecommendationCard game={{ ...game, ...overrides }} />
    </MemoryRouter>
  );

beforeEach(() => mockDispatch.mockClear());

it('opens the game from anywhere on the card', () => {
  renderCard();

  const links = screen.getAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  links.forEach((link) => expect(link).toHaveAttribute('href', '/games/xcom-2'));
  expect(screen.getByRole('link', { name: 'XCOM 2' })).toBeInTheDocument();
});

it('adds the discounted price it shows', async () => {
  renderCard();
  expect(screen.getByText('$11.99')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

  expect(mockDispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'ADD_TO_CART', payload: expect.objectContaining({ gameId: 'g1', slug: 'xcom-2', price: 11.99 }) })
  );
});

it('cannot add a game that is not out yet', () => {
  renderCard({ isComingSoon: true });
  expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
});
