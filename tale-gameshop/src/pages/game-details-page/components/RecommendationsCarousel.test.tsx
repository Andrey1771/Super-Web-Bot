import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Game } from '../../../models/game';
import RecommendationsCarousel from './RecommendationsCarousel';

/**
 * «More like this» на странице игры — обычная полка сайта: карточки-ссылки с обложкой и ценой,
 * без кнопки «Add to cart», заголовок с подписью и ссылка в каталог. Клик по карточке уходит в аналитику.
 */

const mockTrackItemSelect = jest.fn();
jest.mock('../../../utils/item-list-tracking', () => ({
  ITEM_LISTS: { recommendationsGame: 'recommendations_game' },
  useItemListView: () => undefined,
  trackItemSelect: (...args: unknown[]) => mockTrackItemSelect(...args)
}));

jest.mock('../../../inversify.config', () => ({
  __esModule: true,
  default: { get: () => ({ apiBaseUrl: 'http://api.test' }) }
}));

jest.mock('../../../context/site-preferences', () => ({
  useSitePreferences: () => ({ currency: 'USD' }),
  formatMoney: (value: number, currency: string) => `${currency} ${value.toFixed(2)}`
}));

jest.mock('../../../utils/format-money', () => ({
  formatMoney: (value: number, currency: string) => `$${value.toFixed(2)}`
}));

const game = (id: string, title: string, extra: Partial<Game> = {}): Game => ({
  id,
  slug: id,
  name: title,
  title,
  description: '',
  price: 19.99,
  finalPrice: 19.99,
  currency: 'USD',
  gameType: 0,
  imagePath: `/uploads/${id}.jpg`,
  releaseDate: '2020-01-01T00:00:00Z',
  platforms: ['PC'],
  inStock: true,
  ...extra
});

const items = [game('hades', 'Hades'), game('celeste', 'Celeste', { price: 19.99, finalPrice: 9.99, discountPercent: 50, discountActive: true })];

it('renders the site shelf: linked cards without purchase buttons and a catalog link', () => {
  render(
    <MemoryRouter>
      <RecommendationsCarousel items={items} />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: 'More like this' })).toBeInTheDocument();
  expect(screen.getByText('Recommendations')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Hades/ })).toHaveAttribute('href', '/games/hades');
  expect(screen.getByRole('link', { name: /Celeste/ })).toHaveAttribute('href', '/games/celeste');
  expect(screen.queryByRole('button', { name: /Add to cart/i })).toBeNull();
  expect(screen.getByRole('link', { name: /All games/ })).toHaveAttribute('href', '/games');
});

it('points software recommendations at the software catalog', () => {
  render(
    <MemoryRouter>
      <RecommendationsCarousel items={items} software />
    </MemoryRouter>
  );
  expect(screen.getByRole('link', { name: /All software/ })).toHaveAttribute('href', '/games?type=software');
});

it('reports the picked card and its position to analytics', async () => {
  render(
    <MemoryRouter>
      <RecommendationsCarousel items={items} />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('link', { name: /Celeste/ }));
  expect(mockTrackItemSelect).toHaveBeenCalledWith('recommendations_game', { id: 'celeste', title: 'Celeste', price: 9.99 }, 1, 'USD');
});
