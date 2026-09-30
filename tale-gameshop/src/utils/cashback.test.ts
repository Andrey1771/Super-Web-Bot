import { cashbackProgress, percentRange, tierForSpend, type CashbackTier } from './cashback';

/** Уровни задаёт админка: расчёты обязаны работать с любой лестницей, а не только с встроенной четырёхуровневой. */
const custom: CashbackTier[] = [
    { id: 'bronze', name: 'Bronze', percent: 1, spendThreshold: null },
    { id: 'silver', name: 'Silver', percent: 4, spendThreshold: 100 },
    { id: 'gold', name: 'Gold', percent: 6, spendThreshold: 500 },
    { id: 'platinum', name: 'Platinum', percent: 8, spendThreshold: 1500 },
    { id: 'diamond', name: 'Diamond', percent: 12, spendThreshold: 5000 },
];

describe('cashback levels from settings', () => {
    it('picks the level and the progress on a custom ladder', () => {
        expect(tierForSpend(0, custom).id).toBe('bronze');
        expect(tierForSpend(600, custom).id).toBe('gold');

        const progress = cashbackProgress(1000, custom);
        expect(progress.tier.id).toBe('gold');
        expect(progress.next?.id).toBe('platinum');
        expect(progress.remaining).toBe(500);
        expect(progress.ratio).toBe(0.5);
    });

    it('describes the percent range from the levels, not a fixed 3–10%', () => {
        expect(percentRange(custom).text).toBe('1–12%');
        expect(percentRange([custom[0]]).text).toBe('1%');
    });
});
