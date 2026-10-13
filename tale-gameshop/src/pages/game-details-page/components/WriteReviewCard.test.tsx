import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WriteReviewCard } from './ReviewsTab';

/**
 * Форма отзыва показывается только тем, кто может писать: гость и не-покупатель видят одну
 * плашку с причиной, без выключенных звёзд и поля.
 */

const renderCard = (props: { isAuthenticated: boolean; hasPurchased: boolean }) =>
  render(
    <MemoryRouter>
      <WriteReviewCard {...props} onSubmit={jest.fn()} />
    </MemoryRouter>
  );

it('offers a guest only a sign-in prompt', () => {
  renderCard({ isAuthenticated: false, hasPurchased: false });
  expect(screen.getByTestId('write-review-locked')).toHaveTextContent('Sign in to leave a review');
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/logIn');
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByLabelText('Select rating')).toBeNull();
});

it('tells a signed-in visitor who did not buy the game why the form is closed', () => {
  renderCard({ isAuthenticated: true, hasPurchased: false });
  expect(screen.getByTestId('write-review-locked')).toHaveTextContent('customers who bought this game');
  expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('gives a buyer the full form', () => {
  renderCard({ isAuthenticated: true, hasPurchased: true });
  expect(screen.queryByTestId('write-review-locked')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Write a review' })).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeEnabled();
  expect(screen.getByRole('button', { name: '5 stars' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled();
});
