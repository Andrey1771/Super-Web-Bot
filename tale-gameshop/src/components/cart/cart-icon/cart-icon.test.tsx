import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CartIcon from './cart-icon';

/**
 * Корзина в шапке отвечает на добавление товара: число ждёт приземления летящей обложки и меняется с подскоком.
 * Раньше цифра менялась молча, и добавление было легко не заметить.
 */

let mockItems: Array<{ quantity: number }> = [];
jest.mock('../../../context/cart-context', () => ({
    useCart: () => ({ state: { items: mockItems } }),
}));

let mockInFlight = 0;
let mockLandingListener: (() => void) | null = null;
jest.mock('../cart-flight', () => ({
    CART_TARGET_ATTR: 'data-cart-target',
    flightsInProgress: () => mockInFlight,
    onCartLanding: (listener: () => void) => { mockLandingListener = listener; return () => { mockLandingListener = null; }; },
}));

const show = () => render(<MemoryRouter><CartIcon isText={false} /></MemoryRouter>);

beforeEach(() => { mockItems = []; mockInFlight = 0; mockLandingListener = null; });

it('marks itself as the place covers fly to', () => {
    show();
    expect(screen.getByRole('link', { name: 'Cart' })).toHaveAttribute('data-cart-target');
});

it('bumps and flips the digit as soon as an item is added when nothing is in the air', () => {
    mockItems = [{ quantity: 1 }];
    const { rerender } = show();
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');

    mockItems = [{ quantity: 1 }, { quantity: 1 }];
    rerender(<MemoryRouter><CartIcon isText={false} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Cart, 2 items' })).toHaveClass('is-bump');
    expect(document.querySelector('.cart-icon-digit.is-out')).toHaveTextContent('1');
    expect(document.querySelector('.cart-icon-digit.is-in')).toHaveTextContent('2');
});

it('waits for the flying cover to land before showing the new count', () => {
    const { rerender } = show();
    mockInFlight = 1;
    mockItems = [{ quantity: 1 }];
    rerender(<MemoryRouter><CartIcon isText={false} /></MemoryRouter>);

    expect(screen.queryByTestId('cart-count')).toBeNull();      // обложка ещё летит
    expect(mockLandingListener).not.toBeNull();

    act(() => { mockInFlight = 0; mockLandingListener!(); });
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'Cart, 1 item' })).toHaveClass('is-bump');
});

it('drops the count immediately when an item is removed', () => {
    mockItems = [{ quantity: 2 }];
    const { rerender } = show();
    mockItems = [{ quantity: 1 }];
    rerender(<MemoryRouter><CartIcon isText={false} /></MemoryRouter>);

    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'Cart, 1 item' })).not.toHaveClass('is-bump');
});
