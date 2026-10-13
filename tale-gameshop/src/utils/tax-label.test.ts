import { taxLabel } from './tax-label';

describe('taxLabel', () => {
    it('называет налог и ставку без хвостовых нулей', () => {
        expect(taxLabel('vat', 19)).toBe('VAT 19%');
        expect(taxLabel('gst', 10)).toBe('GST 10%');
        expect(taxLabel('sales_tax', 10.25)).toBe('Sales tax 10.25%');
    });

    it('неизвестный тип и нулевая ставка — просто «Tax»', () => {
        expect(taxLabel('something_new', 0)).toBe('Tax');
        expect(taxLabel(null, null)).toBe('Tax');
        expect(taxLabel('vat', Number.NaN)).toBe('VAT');
    });
});
