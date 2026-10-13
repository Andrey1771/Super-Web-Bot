import './cart-flight.css';

/**
 * Обложка летит в корзину.
 *
 * Одно место на весь магазин: любое добавление в корзину (см. CartProvider) запускает полёт уменьшенной
 * обложки от карточки к иконке корзины в шапке. Иконка помечена атрибутом data-cart-target; нет иконки
 * (Mini App, админка) — полёта нет, корзина просто обновляется.
 *
 * Полёт — на CSS-переходах, а приземление — по таймеру: так число в корзине обновится, даже если вкладка не
 * перерисовывается (requestAnimationFrame в фоне стоит). Внешний слой едет по прямой, внутренний рисует дугу.
 */
export const CART_TARGET_ATTR = 'data-cart-target';
/** Контейнер товара, из которого брать обложку; без атрибута берётся ближайшая карточка (article, .card). */
export const CART_ORIGIN_ATTR = 'data-cart-origin';
export const FLIGHT_MS = 680;

const FLYER_SIZE = 64;

let inFlight = 0;
const landingListeners = new Set<() => void>();

/** Сколько обложек сейчас в воздухе — иконка корзины ждёт их, прежде чем менять число. */
export const flightsInProgress = () => inFlight;

/** Позвать, когда очередная обложка долетела. Возвращает отписку. */
export const onCartLanding = (listener: () => void) => {
    landingListeners.add(listener);
    return () => { landingListeners.delete(listener); };
};

const reducedMotion = () =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Откуда лететь: обложка карточки, в которой нажали кнопку; нет картинки — сама карточка или кнопка. */
export const resolveFlightOrigin = (origin: Element | null | undefined): { element: Element; image: string | null } | null => {
    if (!origin || !(origin instanceof Element) || origin === document.body) {
        return null;
    }
    const container = origin.closest(`[${CART_ORIGIN_ATTR}], article, .card`) ?? origin;
    const img = container.querySelector('img');
    if (img && img.getBoundingClientRect().width > 0) {
        return { element: img, image: img.currentSrc || img.src || null };
    }
    return { element: container, image: null };
};

export interface FlightRequest {
    /** Кнопка, по которой нажали, или карточка товара. */
    origin: Element | null | undefined;
    /** Название товара — для плашки, если картинки нет. */
    label?: string;
}

/** Запускает полёт. false — лететь нечему или некуда (нет иконки, нет карточки, отключено движение). */
export function flyToCart({ origin, label }: FlightRequest): boolean {
    if (typeof document === 'undefined') {
        return false;
    }
    const target = document.querySelector(`[${CART_TARGET_ATTR}]`);
    const from = resolveFlightOrigin(origin);
    if (!target || !from || reducedMotion()) {
        return false;
    }

    const fromRect = from.element.getBoundingClientRect();
    const toRect = target.getBoundingClientRect();
    if (fromRect.width === 0 || toRect.width === 0) {
        return false;
    }

    const flyer = document.createElement('div');
    flyer.className = 'cart-flyer';
    flyer.setAttribute('aria-hidden', 'true');
    const cover = document.createElement('div');
    cover.className = 'cart-flyer-cover';
    if (from.image) {
        const img = document.createElement('img');
        img.src = from.image;
        img.alt = '';
        cover.appendChild(img);
    } else {
        cover.textContent = initials(label);
    }
    flyer.appendChild(cover);

    const startX = fromRect.left + fromRect.width / 2 - FLYER_SIZE / 2;
    const startY = fromRect.top + fromRect.height / 2 - FLYER_SIZE / 2;
    const endX = toRect.left + toRect.width / 2 - FLYER_SIZE / 2;
    const endY = toRect.top + toRect.height / 2 - FLYER_SIZE / 2;
    flyer.style.left = `${startX}px`;
    flyer.style.top = `${startY}px`;
    document.body.appendChild(flyer);

    inFlight += 1;
    // Стартовое положение должно лечь в раскладку до смены transform, иначе перехода не будет.
    void flyer.offsetWidth;
    flyer.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.3)`;
    flyer.classList.add('is-go');

    window.setTimeout(() => {
        flyer.remove();
        inFlight = Math.max(0, inFlight - 1);
        landingListeners.forEach((listener) => listener());
    }, FLIGHT_MS);
    return true;
}

const initials = (label?: string) => {
    const words = (label ?? '').trim().split(/\s+/).filter(Boolean);
    const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
    return letters.toUpperCase() || '•';
};
