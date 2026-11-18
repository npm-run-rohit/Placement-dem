import {
  BusinessType,
  ProductGroup,
  QuoteTargetScenario,
  RiskTier,
  TimingLob,
} from '@bimaplacement/contracts';

/**
 * Which SLA-06 matrix column applies (PRD 8.3):
 *  - New      -> the PM-set risk tier (Preferred / Non-preferred)
 *  - Renewal  -> always the Renewal column
 *  - Rollover -> ignores risk tier: EB uses Non-preferred, every other LOB uses Preferred
 * Returns null when a New ticket has no risk tier yet (Validate is blocked until it does - FR-260).
 */
export function resolveQuoteTargetScenario(input: {
  businessType: BusinessType;
  riskTier: RiskTier | null;
  productGroup: ProductGroup;
}): QuoteTargetScenario | null {
  switch (input.businessType) {
    case BusinessType.RENEWAL:
      return QuoteTargetScenario.RENEWAL;
    case BusinessType.ROLLOVER:
      return input.productGroup === ProductGroup.EB
        ? QuoteTargetScenario.NON_PREFERRED
        : QuoteTargetScenario.PREFERRED;
    case BusinessType.NEW:
    default:
      if (!input.riskTier) return null;
      return input.riskTier === RiskTier.NON_PREFERRED
        ? QuoteTargetScenario.NON_PREFERRED
        : QuoteTargetScenario.PREFERRED;
  }
}

export type QuoteTargetMatrix = Record<TimingLob, Record<QuoteTargetScenario, number>>;

/** Insurer thread target in business minutes; falls back to SLA-06 default (18 BH) when unresolved. */
export function resolveThreadTargetMins(
  matrix: QuoteTargetMatrix,
  timingLob: TimingLob,
  scenario: QuoteTargetScenario | null,
  minutesPerDay: number,
  fallbackMins = 1080,
): number {
  if (!scenario) return fallbackMins;
  const days = matrix[timingLob]?.[scenario];
  return days ? Math.round(days * minutesPerDay) : fallbackMins;
}
