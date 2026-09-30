import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OrderSummaryCard, { type CheckoutCashbackView } from './OrderSummaryCard';
import type { Product } from '../../../reducers/cart-reducer';

/**
 * Сводка на кассе — последнее, что покупатель видит перед списанием денег. Две строки одной игры
 * отличаются только изданием и регионом ключа, и если их не показать, человек платит вслепую.
 */
const line = (over: Partial<Product>): Product => ({
    gameId: 'g1',
    name: 'EA Sports FC 25',
    price: 46.99,
    quantity: 1,
    image: 'cover.png',
    ...over
});

const renderCard = (items: Product[]) =>
    render(
        <MemoryRouter>
            <OrderSummaryCard
                items={items}
                imageBaseUrl=""
                totals={{ subtotal: 108.98, discount: 0, tax: 0, total: 108.98 }}
                promo={{ code: '', applying: false, discountAmount: 0, message: '', error: '' }}
                onPromoCodeChange={() => undefined}
                onApplyPromo={() => undefined}
                onRemovePromo={() => undefined}
            />
        </MemoryRouter>
    );

describe('OrderSummaryCard', () => {
    it('называет регион ключа у каждой строки', () => {
        renderCard([
            line({ offerKey: 'r:EU', offerTitle: 'Europe' }),
            line({ offerKey: 'global', offerTitle: 'Global', price: 61.99 })
        ]);

        expect(screen.getByText('Europe')).toBeInTheDocument();
        expect(screen.getByText('Global')).toBeInTheDocument();
        expect(screen.getAllByText('EA Sports FC 25')).toHaveLength(2);
    });

    it('издание и регион показываются вместе', () => {
        renderCard([line({ editionTitle: 'Deluxe', offerKey: 'r:EU', offerTitle: 'Europe' })]);

        expect(screen.getByText('Deluxe · Europe')).toBeInTheDocument();
    });

    it('строки одной игры получают разные ключи React', () => {
        // Раньше ключом был gameId: два варианта одной игры давали React одинаковый ключ,
        // и он мог переставить содержимое строк местами при пересчёте.
        const warnings: string[] = [];
        const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            warnings.push(String(args[0]));
        });

        renderCard([
            line({ offerKey: 'r:EU', offerTitle: 'Europe' }),
            line({ offerKey: 'global', offerTitle: 'Global' })
        ]);

        spy.mockRestore();
        expect(warnings.filter((message) => message.includes('same key'))).toHaveLength(0);
    });

    it('без вариантов подпись не появляется', () => {
        const { container } = renderCard([line({})]);

        expect(container.querySelectorAll('.order-summary-item-variant')).toHaveLength(0);
    });
});

describe('OrderSummaryCard — налог', () => {
    const renderWithTax = (tax: number, taxLabel?: string) =>
        render(
            <MemoryRouter>
                <OrderSummaryCard
                    items={[line({ price: 20 })]}
                    imageBaseUrl=""
                    totals={{ subtotal: 20, discount: 0, tax, taxLabel, total: 20 }}
                    promo={{ code: '', applying: false, discountAmount: 0, message: '', error: '' }}
                    onPromoCodeChange={() => undefined}
                    onApplyPromo={() => undefined}
                    onRemovePromo={() => undefined}
                />
            </MemoryRouter>
        );

    it('налог показан внутри итога и к нему не прибавляется', () => {
        renderWithTax(3.19, 'VAT 19%');
        expect(screen.getByText('Incl. VAT 19%')).toBeInTheDocument();
        expect(screen.getByText('$3.19')).toBeInTheDocument();
        expect(screen.getAllByText('$20.00').length).toBeGreaterThan(0);
        expect(screen.queryByText('$23.19')).not.toBeInTheDocument();
    });

    it('пока налог не посчитан — «включён в цену»', () => {
        renderWithTax(0);
        expect(screen.getByText('Included in price')).toBeInTheDocument();
    });
});

describe('OrderSummaryCard — кэшбэк', () => {
    const veteran = { id: 'veteran' as const, name: 'Veteran', percent: 5, spendThreshold: 200 };

    const renderWithCashback = (cashback: Partial<CheckoutCashbackView>, total = 73.58) => {
        const view: CheckoutCashbackView = {
            member: true,
            tier: veteran,
            available: 10.55,
            applied: 0,
            on: false,
            onToggle: jest.fn(),
            onSignIn: jest.fn(),
            ...cashback,
        };
        render(
            <MemoryRouter>
                <OrderSummaryCard
                    items={[line({})]}
                    imageBaseUrl=""
                    totals={{ subtotal: total, discount: 0, tax: 0, total }}
                    promo={{ code: '', applying: false, discountAmount: 0, message: '', error: '' }}
                    onPromoCodeChange={() => undefined}
                    onApplyPromo={() => undefined}
                    onRemovePromo={() => undefined}
                    cashback={view}
                />
            </MemoryRouter>
        );
        return view;
    };

    it('без баланса переключателя нет, но видно, сколько вернётся', () => {
        renderWithCashback({ available: 0 });
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        expect(screen.getByText('+$3.68')).toBeInTheDocument();
    });

    it('включённое списание уменьшает итог, а возврат считается с оплаченного деньгами', () => {
        renderWithCashback({ on: true, applied: 10.55 });
        expect(screen.getByText('−$10.55')).toBeInTheDocument();
        expect(screen.getByText('$63.03')).toBeInTheDocument();
        expect(screen.getByText('+$3.15')).toBeInTheDocument();
    });

    it('переключатель сообщает новое состояние', () => {
        const view = renderWithCashback({});
        fireEvent.click(screen.getByRole('switch'));
        expect(view.onToggle).toHaveBeenCalledWith(true);
    });

    it('обложка и название ведут на страницу товара', () => {
        renderCard([line({ slug: 'ea-sports-fc-25' }), line({ gameId: 'g2', name: 'Old Item', slug: undefined, price: 5 })]);
        const links = screen.getAllByRole('link', { name: 'EA Sports FC 25' });
        // Обложка (aria-label) и название — две ссылки на один адрес.
        expect(links).toHaveLength(2);
        links.forEach((link) => expect(link).toHaveAttribute('href', '/games/ea-sports-fc-25'));
        // Старой позиции без slug адрес собирается из названия.
        expect(screen.getAllByRole('link', { name: 'Old Item' })[0]).toHaveAttribute('href', '/games/old-item');
    });

    it('гостю — без переключателя и с предложением войти', () => {
        const view = renderWithCashback({ member: false, available: 0 });
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(view.onSignIn).toHaveBeenCalled();
    });
});
