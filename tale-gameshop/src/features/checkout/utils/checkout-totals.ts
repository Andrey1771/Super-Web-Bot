import {Product} from '../../../reducers/cart-reducer';

type CheckoutTotals = {
    subtotal: number;
    discount: number;
    /** Налог ВНУТРИ итога (цены с налогом): к total не прибавляется. Считает только сервер — в превью 0. */
    tax: number;
    /** Подпись налога с сервера («VAT 19%»); нет — налог ещё не посчитан. */
    taxLabel?: string | null;
    total: number;
};

export const calculateCheckoutTotals = (items: Product[], discountAmount = 0): CheckoutTotals => {
    const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
    const discount = Math.min(Math.max(0, discountAmount), subtotal);
    const tax = 0;
    const total = Math.max(0, subtotal - discount);

    return { subtotal, discount, tax, total };
};
