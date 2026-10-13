import { fillCashbackTokens } from './cashback-terms';
import type { CashbackProgram } from '../../hooks/use-cashback-program';
import { CASHBACK_TIERS } from '../../utils/cashback';

/** Условия кэшбэка говорят то же, что настроено в админке, — а не зашитые когда-то «14 days» и «12 months». */
const program = (over: Partial<CashbackProgram> = {}): CashbackProgram => ({
    loaded: true,
    enabled: true,
    currency: 'USD',
    pendingDays: 14,
    expiryMonths: 12,
    minCardPayment: 0.5,
    emailNotices: true,
    expiryReminderDays: 30,
    tiers: CASHBACK_TIERS,
    ...over,
});

describe('cashback terms tokens', () => {
    it('uses the configured hold, expiry, minimum and reminder', () => {
        const p = program({ pendingDays: 7, expiryMonths: 6, minCardPayment: 1, expiryReminderDays: 10 });
        expect(fillCashbackTokens('{{cashbackHoldRule}}', p)).toContain('held for 7 days first');
        expect(fillCashbackTokens('{{cashbackExpiryRule}}', p)).toBe('Cashback is valid for 6 months from the day it was earned.');
        expect(fillCashbackTokens('at least {{cashbackMinCardPayment}}', p)).toBe('at least $1.00');
        expect(fillCashbackTokens('{{cashbackEmailsRule}}', p)).toContain('about 10 days before');
    });

    it('turns zero settings into sensible sentences instead of "0 days"', () => {
        const p = program({ pendingDays: 0, expiryMonths: 0 });
        expect(fillCashbackTokens('{{cashbackHoldRule}}', p)).toContain('can be spent right away');
        expect(fillCashbackTokens('{{cashbackExpiryRule}}', p)).toContain('does not expire');
        // Не сгорает — не о чем и напоминать.
        expect(fillCashbackTokens('{{cashbackEmailsRule}}', p)).not.toContain('expires');
        expect(fillCashbackTokens('{{cashbackEmailsRule}}', program({ emailNotices: false }))).toContain('do not send cashback emails');
    });

    it('leaves other placeholders for the legal details', () => {
        expect(fillCashbackTokens('orders at {{entity}}', program())).toBe('orders at {{entity}}');
    });
});
