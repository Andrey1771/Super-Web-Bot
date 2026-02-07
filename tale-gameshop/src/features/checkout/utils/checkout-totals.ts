import {Product} from '../../../reducers/cart-reducer';

type CheckoutTotals = {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
};

export const calculateCheckoutTotals = (items: Product[], discountAmount = 0): CheckoutTotals => {
    const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
    const discount = Math.min(Math.max(0, discountAmount), subtotal);
    const tax = 0;
    const total = Math.max(0, subtotal - discount + tax);

    return { subtotal, discount, tax, total };
};
