import {
  BusinessType,
  ProductGroup,
  QUOTE_TARGET_MATRIX_SEED,
  QuoteTargetScenario,
  RiskTier,
  TimingLob,
} from '@bimaplacement/contracts';
import { resolveQuoteTargetScenario, resolveThreadTargetMins } from './quote-target.resolver';

describe('SLA-06 quote-collection target', () => {
  it('New uses the risk tier', () => {
    expect(
      resolveQuoteTargetScenario({
        businessType: BusinessType.NEW,
        riskTier: RiskTier.NON_PREFERRED,
        productGroup: ProductGroup.EB,
      }),
    ).toBe(QuoteTargetScenario.NON_PREFERRED);
    expect(
      resolveQuoteTargetScenario({
        businessType: BusinessType.NEW,
        riskTier: null,
        productGroup: ProductGroup.EB,
      }),
    ).toBeNull();
  });
  it('Renewal always uses the renewal column', () => {
    expect(
      resolveQuoteTargetScenario({
        businessType: BusinessType.RENEWAL,
        riskTier: RiskTier.NON_PREFERRED,
        productGroup: ProductGroup.PNC,
      }),
    ).toBe(QuoteTargetScenario.RENEWAL);
  });
  it('Rollover: EB -> non-preferred, others -> preferred', () => {
    expect(
      resolveQuoteTargetScenario({
        businessType: BusinessType.ROLLOVER,
        riskTier: null,
        productGroup: ProductGroup.EB,
      }),
    ).toBe(QuoteTargetScenario.NON_PREFERRED);
    expect(
      resolveQuoteTargetScenario({
        businessType: BusinessType.ROLLOVER,
        riskTier: RiskTier.NON_PREFERRED,
        productGroup: ProductGroup.LIABILITY,
      }),
    ).toBe(QuoteTargetScenario.PREFERRED);
  });
  it('EB non-preferred = 7 business days', () => {
    expect(
      resolveThreadTargetMins(QUOTE_TARGET_MATRIX_SEED, TimingLob.EB, QuoteTargetScenario.NON_PREFERRED, 540),
    ).toBe(7 * 540);
  });
  it('falls back to 18 BH', () => {
    expect(resolveThreadTargetMins(QUOTE_TARGET_MATRIX_SEED, TimingLob.EB, null, 540)).toBe(1080);
  });
});
