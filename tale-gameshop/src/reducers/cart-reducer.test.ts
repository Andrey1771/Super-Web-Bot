import { cartReducer, type CartState, type Product } from './cart-reducer';

/**
 * Корзина в браузере помнит, чья она. Раньше копия корзины аккаунта переживала выход (следующий гость видел чужие игры),
 * а при входе в другой аккаунт вливалась в него.
 */

const mockPost = jest.fn(() => Promise.resolve());
let mockEmail: string | undefined;

jest.mock('../inversify.config', () => ({
    __esModule: true,
    default: {
        get: () => ({
            keycloak: { get tokenParsed() { return mockEmail ? { email: mockEmail } : undefined; } },
            api: { post: (...args: unknown[]) => mockPost(...(args as [])) },
        }),
    },
}));

const game = (gameId: string): Product => ({ gameId, name: gameId, price: 10, quantity: 1, image: '' } as Product);

beforeEach(() => {
    mockPost.mockClear();
    mockEmail = undefined;
});

it('adopts the account cart with its owner without sending it back to the server', () => {
    mockEmail = 'anna@shop.dev';
    const guest: CartState = { items: [game('g1')] };

    const adopted = cartReducer(guest, { type: 'ADOPT_CART', payload: { items: [game('g1'), game('g2')], owner: 'anna@shop.dev' } });

    expect(adopted.owner).toBe('anna@shop.dev');
    expect(adopted.items.map((item) => item.gameId)).toEqual(['g1', 'g2']);
    expect(mockPost).not.toHaveBeenCalled();
});

it('drops the copy of an account cart when the site opens as a guest, but keeps a guest cart', () => {
    const accountCopy: CartState = { items: [game('g1')], owner: 'anna@shop.dev', currency: 'USD' };
    const reset = cartReducer(accountCopy, { type: 'RESET_LOCAL_CART' });
    expect(reset.items).toEqual([]);
    expect(reset.owner).toBeNull();
    expect(reset.currency).toBe('USD');

    const guestCart: CartState = { items: [game('g1')] };
    expect(cartReducer(guestCart, { type: 'RESET_LOCAL_CART' })).toBe(guestCart);
    expect(mockPost).not.toHaveBeenCalled();
});

it('still saves ordinary changes of a signed-in buyer to the server', () => {
    mockEmail = 'anna@shop.dev';
    cartReducer({ items: [], owner: 'anna@shop.dev' }, { type: 'ADD_TO_CART', payload: game('g3') });
    expect(mockPost).toHaveBeenCalledWith('/api/cart/anna@shop.dev', expect.objectContaining({ userId: 'anna@shop.dev' }));
});
