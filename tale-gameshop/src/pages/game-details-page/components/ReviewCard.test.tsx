import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Review } from '../../../types/game-details';
import { ReviewCard } from './ReviewsTab';
import { formatDate } from '../../../i18n/format';

jest.mock('../../../inversify.config', () => ({ __esModule: true, default: { get: () => ({ stateChangedEmitter: { emit: jest.fn() } }) } }));

afterEach(() => window.sessionStorage.clear());

/**
 * Кнопки под отзывом делают что-то видимое: голос подсвечивает кнопку, жалоба превращается
 * в «Reported», ошибка пишется под кнопками, гостя уводит на вход.
 */

const review: Review = {
  id: 'r1',
  userName: 'Ana P.',
  verifiedPurchase: true,
  rating: 5,
  text: 'Third playthrough and still finding things.',
  createdAt: '2026-09-13T00:00:00Z',
  helpfulCount: 3
};

const renderCard = (props: Partial<React.ComponentProps<typeof ReviewCard>> = {}) =>
  render(
    <MemoryRouter>
      <ReviewCard review={review} onHelpful={jest.fn()} onReport={jest.fn()} canInteract {...props} />
    </MemoryRouter>
  );

it('marks the helpful button as pressed once the vote is saved', async () => {
  const onHelpful = jest.fn().mockResolvedValue(true);
  renderCard({ onHelpful });

  const helpful = screen.getByRole('button', { name: /Helpful \(3\)/ });
  expect(helpful).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(helpful);
  expect(onHelpful).toHaveBeenCalledWith('r1');
  expect(helpful).toHaveAttribute('aria-pressed', 'true');
});

it('reports through the reason dialog and confirms whether the review got hidden', async () => {
  const onReport = jest.fn().mockResolvedValue({ reported: true, hidden: true, reports: 3 });
  renderCard({ onReport });

  await userEvent.click(screen.getByRole('button', { name: 'Report' }));
  const dialog = screen.getByRole('dialog', { name: 'Report this review' });
  expect(onReport).not.toHaveBeenCalled();

  await userEvent.click(within(dialog).getByLabelText(/Spam or advertising/));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
  expect(onReport).toHaveBeenCalledWith('r1', { reason: 'Spam', comment: undefined });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
  expect(screen.getByText(/hidden until a moderator/)).toBeInTheDocument();
});

it('closing the reason dialog reports nothing', async () => {
  const onReport = jest.fn();
  renderCard({ onReport });
  await userEvent.click(screen.getByRole('button', { name: 'Report' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onReport).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Report' })).toBeInTheDocument();
});

it('shows an error instead of silently failing', async () => {
  const onHelpful = jest.fn().mockRejectedValue(new Error('boom'));
  renderCard({ onHelpful });

  await userEvent.click(screen.getByRole('button', { name: /Helpful/ }));
  expect(screen.getByText('Could not save that. Please try again.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Helpful/ })).toHaveAttribute('aria-pressed', 'false');
});

it('explains an expired session under the vote and offers to sign in', async () => {
  const onHelpful = jest.fn().mockRejectedValue({ response: { status: 401 } });
  const onSignIn = jest.fn();
  renderCard({ onHelpful, onSignIn });

  await userEvent.click(screen.getByRole('button', { name: /Helpful/ }));
  expect(screen.getByText(/Your session has expired/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

it('reopens the report dialog with the draft saved before signing in', () => {
  window.sessionStorage.setItem('taleshop:review-report-draft', JSON.stringify({ reviewId: 'r1', reason: 'Spam', comment: 'Promo.', savedAt: Date.now() }));
  renderCard({ initialReportDraft: { reviewId: 'r1', reason: 'Spam', comment: 'Promo.', savedAt: Date.now() } });

  const dialog = screen.getByRole('dialog', { name: 'Report this review' });
  expect(within(dialog).getByLabelText(/Spam or advertising/)).toBeChecked();
  expect(within(dialog).getByPlaceholderText('What should the moderator look at?')).toHaveValue('Promo.');
  expect(window.sessionStorage.getItem('taleshop:review-report-draft')).toBeNull();
});

it('sends a guest to sign in instead of disabling the buttons', async () => {
  const onSignIn = jest.fn();
  const onHelpful = jest.fn();
  renderCard({ canInteract: false, onSignIn, onHelpful });

  const helpful = screen.getByRole('button', { name: /Helpful/ });
  expect(helpful).toBeEnabled();
  await userEvent.click(helpful);
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(onHelpful).not.toHaveBeenCalled();
});

it('shows the stars and the date, with no recommendation label even if the server sends one', () => {
  renderCard({ review: { ...review, recommend: true } });
  expect(screen.getByLabelText('Rating 5 out of 5')).toBeInTheDocument();
  expect(screen.getByText(formatDate('2026-09-13T00:00:00Z'))).toHaveAttribute('dateTime', '2026-09-13T00:00:00Z');
  expect(screen.queryByText(/recommended/i)).toBeNull();
});

it('asks whether the review was helpful and confirms the vote in words', async () => {
  renderCard({ onHelpful: jest.fn().mockResolvedValue(true) });
  expect(screen.getByText('Was this review helpful?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Helpful (3)' }));
  expect(screen.getByText('You found this helpful')).toBeInTheDocument();
});

it('keeps the author’s line breaks and offers "Show more" for a short text made of many lines', async () => {
  const multiline = 'Pros:\n+ story\n+ music\n\n\n\nCons:\n- price';
  renderCard({ review: { ...review, text: multiline } });
  // Лишние пустые строки схлопнуты до одной; переносы остались.
  const paragraph = screen.getByText((_, node) => Boolean(node && node.classList.contains('review-text') && node.textContent === 'Pros:\n+ story\n+ music\n\nCons:\n- price'));
  expect(paragraph).not.toHaveClass('is-expanded');
  await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(paragraph).toHaveClass('is-expanded');
  expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
});

it('shows when the author edited the review, and nothing when they did not', () => {
  const { rerender } = renderCard();
  expect(screen.queryByText(/^Edited/)).toBeNull();
  rerender(
    <MemoryRouter>
      <ReviewCard review={{ ...review, editedAt: '2026-09-20T00:00:00Z' }} onHelpful={jest.fn()} onReport={jest.fn()} canInteract />
    </MemoryRouter>
  );
  expect(screen.getByText(`Edited ${formatDate('2026-09-20T00:00:00Z')}`)).toHaveAttribute('dateTime', '2026-09-20T00:00:00Z');
});

it('marks a refunded purchase quietly and only when the server says so', () => {
  const { rerender } = renderCard();
  expect(screen.queryByText('Refunded')).toBeNull();
  rerender(
    <MemoryRouter>
      <ReviewCard review={{ ...review, refunded: true }} onHelpful={jest.fn()} onReport={jest.fn()} canInteract />
    </MemoryRouter>
  );
  expect(screen.getByText('Refunded')).toHaveAttribute('title', expect.stringMatching(/refunded the purchase/));
});

it('does not show a purchase badge or screenshots on the card', () => {
  renderCard({ review: { ...review, images: [{ url: '/shot.svg', thumbUrl: '/shot.svg' }] } });
  expect(screen.queryByText('Verified purchase')).toBeNull();
  expect(screen.queryByRole('img', { name: /screenshot/i })).toBeNull();
});
