import { previewItemRefund } from './OrderDetailsDrawer';
import type { Order, OrderItem } from '../../types/orders';

/**
 * Предпросмотр возврата позиции должен совпадать с сервером (OrderRefunds.Plan): на карту — накопленная доля
 * списанного картой, вниз до цента, минус уже возвращённое; последняя позиция забирает остаток.
 */
const item = (itemId: string, lineTotal: number, qty: number, refundedQty = 0): OrderItem => ({
  itemId,
  lineTotal,
  refundedQty,
  qty,
  gameId: itemId,
  title: itemId,
  price: lineTotal / qty,
  keysDelivered: qty,
  keysNeeded: qty,
  keyMasks: [],
});

const order = (items: OrderItem[], card: number, refundedAmount = 0): Order =>
  ({
    id: 'o',
    number: 'TS-1',
    userId: 'buyer@example.com',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    totalAmount: card,
    refundedAmount,
    cashbackApplied: 247.77 - card,
    currency: 'USD',
    items,
    createdAt: '',
    updatedAt: '',
    events: [],
  }) as unknown as Order;

it('splits an item mostly paid with cashback between the card and the balance', () => {
  const a = item('a', 49.99, 1);
  const b = item('b', 197.78, 2);
  const preview = previewItemRefund(order([a, b], 1), a, 1)!;

  expect(preview.lineValue).toBeCloseTo(49.99);
  expect(preview.toCard).toBe(0.2);
  expect(preview.toCashback).toBeCloseTo(49.79);
  expect(preview.allRefunded).toBe(false);
});

it('gives the last item exactly what is left on the card', () => {
  const a = item('a', 49.99, 1, 1);
  const b = item('b', 197.78, 2, 1);
  const preview = previewItemRefund(order([a, b], 1, 0.6), b, 1)!;

  expect(preview.allRefunded).toBe(true);
  expect(preview.toCard).toBeCloseTo(0.4);
});
