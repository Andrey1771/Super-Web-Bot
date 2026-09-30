import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentCardTile from './PaymentCardTile';

/**
 * Сохранённая карта в кабинете рисуется как карта: система по цвету и знаку, номер, срок. Действия — на самой
 * карте: звезда делает основной (у основной залита и служит меткой), крестик удаляет.
 */

const visa = { id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 3, expYear: 2033, isDefault: true };
const master = { id: 'pm_2', brand: 'MasterCard', last4: '5556', expMonth: 2, expYear: 2029, isDefault: false };

it('reads as a card: brand, last digits, expiry and a filled star on the default one', () => {
    render(<PaymentCardTile method={visa} onRemove={jest.fn()} onSetDefault={jest.fn()} />);

    const plastic = screen.getByTestId('payment-card-plastic');
    expect(plastic).toHaveClass('is-visa');
    expect(screen.getByRole('img', { name: 'Visa ending in 4242, default' })).toBeInTheDocument();
    expect(plastic).toHaveTextContent('4242');
    expect(plastic).toHaveTextContent('Expires 03/2033');
    expect(plastic).toHaveTextContent('Visa');
    // Основную карту не предлагают сделать основной: звезда залита и только показывает статус.
    expect(screen.getByRole('img', { name: 'Default card' })).toHaveClass('is-active');
    expect(screen.queryByRole('button', { name: 'Set as default' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove card' })).toBeInTheDocument();
});

it('colours the plastic by brand and lets the star make a secondary card the default', async () => {
    const onSetDefault = jest.fn();
    const onRemove = jest.fn();
    render(<PaymentCardTile method={master} onSetDefault={onSetDefault} onRemove={onRemove} />);

    expect(screen.getByTestId('payment-card-plastic')).toHaveClass('is-mastercard');
    expect(screen.getByRole('img', { name: 'Mastercard ending in 5556' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set as default' }));
    expect(onSetDefault).toHaveBeenCalledWith('pm_2');
    await userEvent.click(screen.getByRole('button', { name: 'Remove card' }));
    expect(onRemove).toHaveBeenCalledWith('pm_2');
});

it('falls back to the site colour for an unknown brand, shows the label and locks buttons while busy', () => {
    render(<PaymentCardTile method={{ ...master, brand: 'jcb', label: 'Work card' }} onSetDefault={jest.fn()} onRemove={jest.fn()} busy />);

    const plastic = screen.getByTestId('payment-card-plastic');
    expect(plastic).toHaveClass('is-generic');
    expect(plastic).toHaveTextContent('Work card');
    expect(screen.getByRole('button', { name: 'Set as default' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove card' })).toBeDisabled();
});
