import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OrderDetails } from './AccountOrdersPage';
import type { AccountOrderDetails } from '../../../types/account-orders';

const mockRevealOrderKeys = jest.fn();
const mockResendOrderKeys = jest.fn();
jest.mock('../../../api/accountApi', () => ({
  fetchAccountOrderDetails: jest.fn(),
  revealAccountOrderKeys: (...args: unknown[]) => mockRevealOrderKeys(...args),
  resendAccountOrderKeys: (...args: unknown[]) => mockResendOrderKeys(...args)
}));
jest.mock('../../../context/site-preferences', () => ({ useSitePreferences: () => ({ currency: 'USD', country: 'US' }) }));

/**
 * Ключи доступны и без письма: «Show keys» спрашивает пароль и раскрывает их целиком по
 * позициям, «Resend» шлёт письмо на адрес аккаунта и честно говорит, куда ушло или почему нет.
 */

const details: AccountOrderDetails = {
  orderId: 'TS-1',
  internalId: 'order-1',
  createdAt: '2026-09-26T00:00:00Z',
  status: 'delivered',
  currency: 'USD',
  totals: { subtotal: 10, discountTotal: 0, taxTotal: 0, total: 10, taxIncluded: true },
  items: [
    {
      itemId: 'item-1', productType: 'Game', gameId: 'g1', title: 'Lanternfall', quantity: 1, unitPrice: 10, currency: 'USD',
      unitDiscount: 0, finalUnitPrice: 10, lineTotal: 10, deliveryType: 'Key', keys: ['•••••FDD2'], slug: 'lanternfall', available: true
    }
  ]
} as AccountOrderDetails;

const show = () => render(<MemoryRouter><OrderDetails details={details} /></MemoryRouter>);

beforeEach(() => {
  mockRevealOrderKeys.mockReset();
  mockResendOrderKeys.mockReset();
});

it('asks for the password, reveals the full keys and hides them again', async () => {
  mockRevealOrderKeys.mockResolvedValue({ items: [{ itemId: 'item-1', keys: ['AAAAA-BBBBB-FDD2'] }] });
  show();
  expect(screen.getByText('•••••FDD2')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Show keys' }));
  const dialog = screen.getByRole('dialog', { name: 'Confirm your password' });
  expect(mockRevealOrderKeys).not.toHaveBeenCalled();

  await userEvent.type(within(dialog).getByLabelText('Password'), 'hunter2');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Show keys' }));
  expect(mockRevealOrderKeys).toHaveBeenCalledWith('order-1', 'hunter2');
  expect(await screen.findByText('AAAAA-BBBBB-FDD2')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('•••••FDD2')).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: 'Hide keys' }));
  expect(screen.getByText('•••••FDD2')).toBeInTheDocument();
});

it('keeps the dialog open with the server message when the password is wrong', async () => {
  mockRevealOrderKeys.mockRejectedValue({ response: { status: 400, data: { message: 'Invalid password. 4 attempts left.' } } });
  show();
  await userEvent.click(screen.getByRole('button', { name: 'Show keys' }));
  const dialog = screen.getByRole('dialog', { name: 'Confirm your password' });
  await userEvent.type(within(dialog).getByLabelText('Password'), 'nope');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Show keys' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Invalid password. 4 attempts left.');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('•••••FDD2')).toBeInTheDocument();
});

it('cancelling the password dialog reveals nothing', async () => {
  show();
  await userEvent.click(screen.getByRole('button', { name: 'Show keys' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mockRevealOrderKeys).not.toHaveBeenCalled();
});

it('resends the e-mail to the account address and reports where it went', async () => {
  mockResendOrderKeys.mockResolvedValue({ sentTo: 'ow***@taleshop.test', count: 1 });
  show();
  await userEvent.click(screen.getByRole('button', { name: 'Resend to my email' }));
  expect(mockResendOrderKeys).toHaveBeenCalledWith('order-1');
  expect(await screen.findByRole('status')).toHaveTextContent('Sent 1 key to ow***@taleshop.test.');
  expect(screen.getByRole('button', { name: 'Resend to my email' })).toBeDisabled();
});

it('shows the server reason when the e-mail cannot be sent', async () => {
  mockResendOrderKeys.mockRejectedValue({ response: { status: 429, data: { message: 'We have just sent that e-mail. Try again in 10 min.' } } });
  show();
  await userEvent.click(screen.getByRole('button', { name: 'Resend to my email' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Try again in 10 min.');
  expect(screen.getByRole('button', { name: 'Resend to my email' })).toBeEnabled();
});

it('offers nothing while no key has been delivered yet', () => {
  render(<MemoryRouter><OrderDetails details={{ ...details, items: [{ ...details.items[0], keys: [] }] }} /></MemoryRouter>);
  expect(screen.queryByRole('button', { name: 'Show keys' })).toBeNull();
});
