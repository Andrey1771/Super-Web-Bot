import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { GameDetails } from '../../types/game-details';
import GameCardPreview from './GameCardPreview';

// Подгонка масштаба превью следит за шириной через ResizeObserver — в jsdom его нет.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

const heroProps: Array<Record<string, unknown>> = [];
const overviewProps: Array<Record<string, unknown>> = [];
const purchaseProps: Array<Record<string, unknown>> = [];

jest.mock('../game-details-page/components/GameHero', () => ({
  __esModule: true,
  orderMedia: () => [],
  default: (props: Record<string, unknown> & { purchase: React.ReactNode; about: React.ReactNode }) => {
    heroProps.push(props);
    return (
      <div>
        {props.purchase}
        {props.about}
      </div>
    );
  },
}));
jest.mock('../game-details-page/components/OverviewTab', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    overviewProps.push(props);
    return <div>overview</div>;
  },
}));
jest.mock('../game-details-page/components/PurchaseCard', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    purchaseProps.push(props);
    return <div>purchase</div>;
  },
}));
jest.mock('../game-details-page/components/GameAbout', () => ({ __esModule: true, default: () => <div>about</div> }));
jest.mock('../../components/common/Breadcrumbs', () => ({ __esModule: true, default: () => <nav>crumbs</nav> }));
jest.mock('../../api/adminDlcApi', () => ({
  getGameDlc: () =>
    Promise.resolve({
      kind: 'Game',
      parent: { id: 'base', title: 'Crimson Desert', slug: 'crimson-desert' },
      items: [
        { id: 'pub', slug: 'pub', title: 'Published DLC', imagePath: '', price: 9.99, currency: 'USD', isDraft: false, isComingSoon: false, keysAvailable: 2, releaseDate: '2026-01-01' },
        { id: 'draft', slug: 'draft', title: 'Draft DLC', imagePath: '', price: 4.99, currency: 'USD', isDraft: true, isComingSoon: false, keysAvailable: 0, releaseDate: '2026-01-01' },
      ],
    }),
}));
jest.mock('../../api/adminKeysApi', () => ({ getKeyInventory: () => Promise.resolve({ gameId: 'g', available: 0, assigned: 0 }) }));

/**
 * Превью карточки в редакторе собирается как живая страница: у DLC — его игра, у игры — опубликованные DLC,
 * настоящая карточка покупки с ценой и наличием (без нажатий).
 */
const details = {
  gameId: 'dlc-1', slug: 'deluxe-pack', title: 'Deluxe Pack', genres: ['Action'], currency: 'USD', basePrice: 12.99,
  editions: [], keyType: 'Steam', reviewsCount: 0, ratingAvg: 0, isTopRated: false, systemRequirements: {},
  descriptionMarkdown: '', keyFeatures: [], awards: [],
} as unknown as GameDetails;

it('renders the preview with the parent game, published DLC and a real purchase card', async () => {
  render(
    <MemoryRouter>
      <GameCardPreview details={details} />
    </MemoryRouter>
  );

  await waitFor(() => expect(heroProps.some((props) => (props.parentGame as { id?: string } | null)?.id === 'base')).toBe(true));
  const lastOverview = overviewProps[overviewProps.length - 1];
  expect((lastOverview.dlc as Array<{ id: string }>).map((item) => item.id)).toEqual(['pub']);
  const lastPurchase = purchaseProps[purchaseProps.length - 1];
  expect(lastPurchase.pricing).toEqual({ price: 12.99, currency: 'USD' });
  expect(lastPurchase.availability).toEqual({ status: 'outOfStock' });
});
