import { CART_TARGET_ATTR, FLIGHT_MS, flightsInProgress, flyToCart, onCartLanding, resolveFlightOrigin } from './cart-flight';

/**
 * Обложка летит в корзину при любом добавлении. Тесты держат контракт: лететь есть откуда и куда — летим и
 * сообщаем о приземлении; нет иконки корзины или карточки — тихо ничего не делаем, корзина всё равно обновится.
 */

const rect = (width: number, height: number, left = 0, top = 0) =>
    ({ width, height, left, top, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

let card: HTMLElement;
let button: HTMLElement;
let target: HTMLElement;

beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    card = document.createElement('article');
    const img = document.createElement('img');
    img.src = 'http://shop.test/covers/portal.jpg';
    img.getBoundingClientRect = () => rect(200, 300, 100, 400);
    button = document.createElement('button');
    card.append(img, button);
    document.body.appendChild(card);

    target = document.createElement('a');
    target.setAttribute(CART_TARGET_ATTR, '');
    target.getBoundingClientRect = () => rect(44, 44, 1200, 20);
    document.body.appendChild(target);
});

afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
});

it('takes off from the card cover the button belongs to and lands after the flight', () => {
    const landed = jest.fn();
    const unsubscribe = onCartLanding(landed);

    expect(flyToCart({ origin: button, label: 'Portal 2' })).toBe(true);

    const flyer = document.querySelector('.cart-flyer') as HTMLElement;
    expect(flyer.querySelector('img')).toHaveAttribute('src', 'http://shop.test/covers/portal.jpg');
    expect(flyer.style.left).toBe(`${100 + 100 - 32}px`);           // центр обложки
    expect(flyer.style.transform).toContain('scale(0.3)');
    expect(flightsInProgress()).toBe(1);
    expect(landed).not.toHaveBeenCalled();

    jest.advanceTimersByTime(FLIGHT_MS);
    expect(document.querySelector('.cart-flyer')).toBeNull();
    expect(flightsInProgress()).toBe(0);
    expect(landed).toHaveBeenCalledTimes(1);
    unsubscribe();
});

it('shows the initials when the card has no picture', () => {
    card.querySelector('img')!.remove();
    card.getBoundingClientRect = () => rect(300, 200, 50, 50);

    expect(flyToCart({ origin: button, label: 'House Flipper' })).toBe(true);
    expect(document.querySelector('.cart-flyer-cover')).toHaveTextContent('HF');
});

it('does nothing without a cart icon to fly to, or without a card to fly from', () => {
    target.remove();
    expect(flyToCart({ origin: button, label: 'Portal 2' })).toBe(false);

    document.body.appendChild(target);
    expect(flyToCart({ origin: document.body, label: 'Portal 2' })).toBe(false);   // ничего не в фокусе
    expect(flyToCart({ origin: null, label: 'Portal 2' })).toBe(false);
    expect(document.querySelector('.cart-flyer')).toBeNull();
    expect(flightsInProgress()).toBe(0);
});

it('prefers an explicitly marked product container over the nearest article', () => {
    const marked = document.createElement('div');
    marked.setAttribute('data-cart-origin', '');
    const cover = document.createElement('img');
    cover.src = 'http://shop.test/covers/marked.jpg';
    cover.getBoundingClientRect = () => rect(10, 10);
    const inner = document.createElement('button');
    marked.append(cover, inner);
    card.appendChild(marked);

    expect(resolveFlightOrigin(inner)?.image).toBe('http://shop.test/covers/marked.jpg');
});
