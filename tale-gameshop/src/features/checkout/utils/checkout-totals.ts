import {Product} from '../../../reducers/cart-reducer';

type CheckoutTotals = {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
};

export const calculateCheckoutTotals = (items: Product[]): CheckoutTotals => {
    const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
    const discount = 0;
    const tax = 0;
    const total = Math.max(0, subtotal - discount + tax);

    return {
        subtotal,
        discount,
        tax,
        total
    };
};
