import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportReviewModal from './ReportReviewModal';

jest.mock('../../../inversify.config', () => ({ __esModule: true, default: { get: () => ({ stateChangedEmitter: { emit: jest.fn() } }) } }));

afterEach(() => window.sessionStorage.clear());

/**
 * Окно жалобы: без причины не отправить, «Other» требует пояснения, Esc и крестик закрывают
 * без последствий, повторная жалоба показывает понятную ошибку.
 */

it('requires a reason and sends the chosen reason with the comment', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  render(<ReportReviewModal reviewId="r1" reviewAuthor="Ana P." onSubmit={onSubmit} onClose={jest.fn()} />);

  const send = screen.getByRole('button', { name: 'Send report' });
  expect(send).toBeDisabled();

  await userEvent.click(screen.getByLabelText(/Abusive or offensive/));
  expect(send).toBeEnabled();
  await userEvent.type(screen.getByPlaceholderText('What should the moderator look at?'), 'Insults other players.');
  await userEvent.click(send);

  expect(onSubmit).toHaveBeenCalledWith({ reason: 'Abusive', comment: 'Insults other players.' });
});

it('insists on details for the "Other" reason', async () => {
  render(<ReportReviewModal reviewId="r1" reviewAuthor="Ana P." onSubmit={jest.fn()} onClose={jest.fn()} />);

  await userEvent.click(screen.getByLabelText(/^Other/));
  expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();
  expect(screen.getByText(/Details \(required\)/)).toBeInTheDocument();

  await userEvent.type(screen.getByPlaceholderText('What should the moderator look at?'), 'Copied from Steam.');
  expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled();
});

it('closes on Escape, the close button and Cancel without reporting', async () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn();
  render(<ReportReviewModal reviewId="r1" reviewAuthor="Ana P." onSubmit={onSubmit} onClose={onClose} />);

  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(3);
  expect(onSubmit).not.toHaveBeenCalled();
});

it('explains a repeated report instead of failing silently', async () => {
  const onSubmit = jest.fn().mockRejectedValue({ response: { status: 409, data: { message: 'You have already reported this review.' } } });
  render(<ReportReviewModal reviewId="r1" reviewAuthor="Ana P." onSubmit={onSubmit} onClose={jest.fn()} />);

  await userEvent.click(screen.getByLabelText(/Spam or advertising/));
  await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('You have already reported this review.');
});

it('on an expired session keeps the draft, says so and offers to sign in', async () => {
  const onSubmit = jest.fn().mockRejectedValue({ response: { status: 401 } });
  const onSignIn = jest.fn();
  render(<ReportReviewModal reviewId="r1" reviewAuthor="Ana P." onSubmit={onSubmit} onClose={jest.fn()} onSignIn={onSignIn} />);

  await userEvent.click(screen.getByLabelText(/Malicious links/));
  await userEvent.type(screen.getByPlaceholderText('What should the moderator look at?'), 'Phishing link.');
  await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Your session has expired. Sign in to continue.');
  expect(alert).toHaveTextContent('Your reason and details are saved');
  expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(JSON.parse(window.sessionStorage.getItem('taleshop:review-report-draft')!)).toMatchObject({
    reviewId: 'r1',
    reason: 'Malware',
    comment: 'Phishing link.'
  });
});

it('reopens with the saved draft after signing back in', () => {
  render(
    <ReportReviewModal
      reviewId="r1"
      reviewAuthor="Ana P."
      initialDraft={{ reason: 'Abusive', comment: 'Insults everyone.' }}
      onSubmit={jest.fn()}
      onClose={jest.fn()}
    />
  );
  expect(screen.getByLabelText(/Abusive or offensive/)).toBeChecked();
  expect(screen.getByPlaceholderText('What should the moderator look at?')).toHaveValue('Insults everyone.');
  expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled();
});
