import { normaliseInr, targetFlag } from './target-flag';

describe('target premium', () => {
  it('flags', () => {
    expect(targetFlag(null, 100)).toBe('Target Not Available');
    expect(targetFlag(100, 90)).toBe('Target Met');
    expect(targetFlag(100, 110)).toBe('Above Target');
  });
  it('normalises INR text', () => {
    expect(normaliseInr('₹78 L')).toBe(7_800_000);
    expect(normaliseInr('1.2 Cr')).toBe(12_000_000);
    expect(normaliseInr('78,00,000')).toBe(7_800_000);
    expect(normaliseInr('50 lakh')).toBe(5_000_000);
    expect(normaliseInr('TBD')).toBeNull();
    expect(normaliseInr(0)).toBeNull();
  });
});
