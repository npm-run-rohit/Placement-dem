import { normaliseRowValue, parseAmount, parseDate, rowsFromComparison } from './row-values';

describe('normaliseRowValue', () => {
  it('accepts amounts as numbers or Indian-formatted text', () => {
    expect(normaliseRowValue('premium', 245000)).toEqual({ ok: true, value: 245000 });
    expect(normaliseRowValue('premium', '₹ 2,45,000')).toEqual({ ok: true, value: 245000 });
    expect(normaliseRowValue('premium', 'lots').ok).toBe(false);
    expect(normaliseRowValue('premium', -1).ok).toBe(false);
  });

  it('needs a real date for validity, and clears on empty', () => {
    expect(normaliseRowValue('validityDate', '31/12/2026')).toEqual({ ok: true, value: '2026-12-31' });
    expect(normaliseRowValue('validityDate', '30 days').ok).toBe(false);
    expect(normaliseRowValue('validityDate', '2026-02-30').ok).toBe(false);
    expect(normaliseRowValue('sumInsured', '  ')).toEqual({ ok: true, value: null });
    expect(normaliseRowValue('termsNote', 42).ok).toBe(false);
  });
});

describe('parseAmount / parseDate', () => {
  it('reads lakh and crore', () => {
    expect(parseAmount('2.5 lakh')).toBe(250000);
    expect(parseAmount('INR 1.2 Cr')).toBe(12000000);
    expect(parseAmount('Rs. 12,345/-')).toBe(12345);
  });
  it('reads dd/mm/yyyy and ISO', () => {
    expect(parseDate('5.1.2027')).toBe('2027-01-05');
    expect(parseDate('2027-01-05')).toBe('2027-01-05');
    expect(parseDate('Jan 5')).toBeNull();
  });
});

describe('rowsFromComparison', () => {
  it('maps Copycat terms to row fields per insurer column, the rest into the terms note', () => {
    const rows = rowsFromComparison({
      products: [
        {
          product: 'GMC',
          columns: [
            { quoteId: 'q1', insurer: 'A' },
            { quoteId: 'q2', insurer: 'B' },
          ],
          rows: [
            { term: 'Annual premium (incl. GST)', values: ['₹ 2,45,000', '3.1 lakh'] },
            { term: 'Sum insured per family', values: ['5,00,000', null] },
            { term: 'Quote validity', values: ['31/12/2026', '30 days'] },
            { term: 'Room rent', values: ['1% of SI', 'No cap'] },
          ],
        },
      ],
    });
    expect(rows.get('q1')).toEqual({
      premium: 245000,
      sumInsured: '5,00,000',
      validityDate: '2026-12-31',
      termsNote: 'Room rent: 1% of SI',
    });
    expect(rows.get('q2')).toEqual({
      premium: 310000,
      termsNote: 'Quote validity: 30 days; Room rent: No cap',
    });
  });

  it('copes with no comparison', () => {
    expect(rowsFromComparison(undefined).size).toBe(0);
  });
});
