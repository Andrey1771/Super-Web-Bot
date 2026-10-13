import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Review } from '../../../types/game-details';
import type { IGameDetailsService } from '../../../iterfaces/i-game-details-service';
import ReviewsTab, { DEFAULT_SORT, PAGE_SIZE } from './ReviewsTab';

jest.mock('../../../inversify.config', () => ({ __esModule: true, default: { get: () => ({ stateChangedEmitter: { emit: jest.fn() } }) } }));

/**
 * Отзывы листаются страницами, а не дописываются в конец: номер страницы живёт в адресе,
 * порядок по умолчанию — «Most helpful», смена сортировки возвращает на первую страницу.
 */

const TOTAL = 23;
const makeReview = (n: number): Review => ({
  id: `r${n}`,
  userName: `User ${n}`,
  verifiedPurchase: true,
  rating: 5,
  text: `Review number ${n}`,
  createdAt: '2026-09-13T00:00:00Z',
  helpfulCount: TOTAL - n
});

const getReviews = jest.fn(async (_gameId: string, filters: { page?: number; pageSize?: number }) => {
  const page = filters.page ?? 1;
  const size = filters.pageSize ?? PAGE_SIZE;
  const from = (page - 1) * size + 1;
  const items = Array.from({ length: Math.max(0, Math.min(size, TOTAL - from + 1)) }, (_, i) => makeReview(from + i));
  return { items, total: TOTAL };
});

const service = { getReviews } as unknown as IGameDetailsService;

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
};

const renderTab = (initialEntry = '/games/lanternfall?tab=reviews') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/games/:slug"
          element={
            <>
              <ReviewsTab
                gameId="g1"
                service={service}
                ratingSummary={{ average: 4.7, totalReviews: TOTAL, label: 'Very Positive' }}
                breakdown={[]}
                tags={[]}
                isAuthenticated={false}
              />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => getReviews.mockClear());

it('loads the first page sorted by helpfulness and shows numbered pages instead of "Show more"', async () => {
  renderTab();

  expect(await screen.findByText('Review number 1')).toBeInTheDocument();
  expect(getReviews).toHaveBeenLastCalledWith('g1', expect.objectContaining({ page: 1, pageSize: PAGE_SIZE, sort: DEFAULT_SORT }));
  expect(screen.getByText(`Showing 1–${PAGE_SIZE} of ${TOTAL}`)).toBeInTheDocument();
  expect(screen.queryByText(/Show more reviews/)).toBeNull();
  expect(screen.getByRole('navigation', { name: 'Review pages' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument();
});

it('puts the page into the address and loads that page', async () => {
  renderTab();
  await screen.findByText('Review number 1');

  await userEvent.click(screen.getByRole('button', { name: 'Page 3' }));

  expect(await screen.findByText('Review number 21')).toBeInTheDocument();
  expect(screen.queryByText('Review number 1')).toBeNull();
  expect(screen.getByTestId('location')).toHaveTextContent('page=3');
  expect(screen.getByText(`Showing 21–${TOTAL} of ${TOTAL}`)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

it('opens straight on the page from the link', async () => {
  renderTab('/games/lanternfall?tab=reviews&page=2');
  expect(await screen.findByText('Review number 11')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
});

it('falls back to the last page when the link points past the end', async () => {
  renderTab('/games/lanternfall?tab=reviews&page=9');
  expect(await screen.findByText('Review number 21')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=3'));
});

it('changing the sort order returns to the first page', async () => {
  renderTab('/games/lanternfall?tab=reviews&page=2');
  await screen.findByText('Review number 11');

  await userEvent.click(screen.getByRole('button', { name: /Most helpful/ }));
  await userEvent.click(screen.getByRole('option', { name: 'Newest' }));

  expect(await screen.findByText('Review number 1')).toBeInTheDocument();
  expect(getReviews).toHaveBeenLastCalledWith('g1', expect.objectContaining({ page: 1, sort: 'createdAt:desc' }));
  expect(screen.getByTestId('location')).not.toHaveTextContent('page=');
});
