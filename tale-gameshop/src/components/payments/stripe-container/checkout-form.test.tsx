import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CheckoutForm from './checkout-form';

/**
 * Согласие на немедленную выдачу ключей перед оплатой.
 *
 * Цифровой товар выдаётся сразу, поэтому подтверждение должно быть и явным, и записанным.
 * Тесты держат оба конца: заплатить, не подтвердив, нельзя, а если запись согласия не прошла —
 * платёж не начинается вовсе. Второе важнее первого: галочка без записи ничего не доказывает.
 */

const mockConfirmPayment = jest.fn();

jest.mock('@stripe/react-stripe-js', () => ({
    useStripe: () => ({ confirmPayment: (...args: unknown[]) => mockConfirmPayment(...args) }),
    useElements: () => ({}),
    PaymentElement: () => <div data-testid="payment-element" />,
    ExpressCheckoutElement: () => <div data-testid="express-element" />,
}));

const consent = { version: '2026-09-05', text: 'I ask for my keys to be delivered immediately.' };

const renderForm = (props: Partial<React.ComponentProps<typeof CheckoutForm>> = {}) => {
    // as jest.Mock: сузить объединение типов иначе нечем, а порядку вызовов нужен .mock.
    const onRecordConsent = (props.onRecordConsent ?? jest.fn().mockResolvedValue(undefined)) as jest.Mock;
    render(
        <MemoryRouter>
            <CheckoutForm
                clientSecret="pi_123_secret_abc"
                consent={consent}
                onRecordConsent={onRecordConsent}
                {...props}
            />
        </MemoryRouter>,
    );
    return { onRecordConsent };
};

const payButton = () => screen.getByTestId('place-order-button');

beforeEach(() => {
    jest.clearAllMocks();
    mockConfirmPayment.mockResolvedValue({});
});

it('shows the wording the server gave and blocks payment until it is confirmed', async () => {
    renderForm();

    expect(screen.getByText(consent.text)).toBeInTheDocument();
    expect(payButton()).toBeDisabled();

    await userEvent.click(screen.getByTestId('delivery-consent'));

    expect(payButton()).toBeEnabled();
});

it('records the consent before charging the card', async () => {
    const { onRecordConsent } = renderForm();

    await userEvent.click(screen.getByTestId('delivery-consent'));
    await userEvent.click(payButton());

    await waitFor(() => expect(mockConfirmPayment).toHaveBeenCalled());
    expect(onRecordConsent).toHaveBeenCalledWith(consent.version);
    // Порядок здесь и есть смысл: сначала запись, потом деньги.
    expect(onRecordConsent.mock.invocationCallOrder[0])
        .toBeLessThan(mockConfirmPayment.mock.invocationCallOrder[0]);
});

it('does not charge anything when the consent could not be saved', async () => {
    const onRecordConsent = jest.fn().mockRejectedValue(new Error('network is down'));
    renderForm({ onRecordConsent });

    await userEvent.click(screen.getByTestId('delivery-consent'));
    await userEvent.click(payButton());

    expect(await screen.findByText(/could not save your confirmation/i)).toBeInTheDocument();
    expect(mockConfirmPayment).not.toHaveBeenCalled();
});

it('keeps payment closed when the terms themselves failed to load', () => {
    renderForm({ consent: null });

    expect(screen.getByRole('alert')).toHaveTextContent(/payment is unavailable/i);
    expect(payButton()).toBeDisabled();
});
