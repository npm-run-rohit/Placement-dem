import { BusinessType, INDUSTRY_TYPES_SEED, type FloatPayload } from '@bimaplacement/contracts';

/**
 * DEV FIXTURE - mock BimaSetu floats for the "Simulate BimaSetu float" block (not PRD data, never seeded).
 * Product codes and industry types come from the PRD masters; client names, links and premiums are invented
 * for the simulator only. `rm` is filled in from the directory at call time.
 */
export type FloatPreset = 'gmc_new' | 'fire_renewal' | 'no_rfq';

export function floatPreset(preset: FloatPreset, rm: FloatPayload['rm'], stamp: string): FloatPayload {
  const base = {
    lineRef: `BS-DEV-${stamp}`,
    rm,
    exclusiveMandate: false,
    opportunityId: null,
  };
  switch (preset) {
    case 'fire_renewal':
      return {
        ...base,
        productType: 'FIRE_FACTORY',
        businessName: 'Dev Float Polymers Pvt Ltd',
        businessType: BusinessType.RENEWAL,
        industryType: INDUSTRY_TYPES_SEED[0],
        rfq: {
          linkUrl: `https://example.test/bimasetu/rfq/${stamp}`,
          renderedViewUrl: `https://example.test/bimasetu/rfq/${stamp}/view`,
        },
        targetPremium: 2400000,
        noteToPlacement: 'Renewal; client wants the expiring terms matched.',
        renewalDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        incumbentInsurer: null,
        client: { id: `CL-DEV-${stamp}`, name: 'Dev Float Polymers Pvt Ltd', spoc: 'Dev Spoc' },
      };
    case 'no_rfq':
      return {
        ...base,
        productType: 'GMC',
        businessName: 'Dev Float Missing RFQ Pvt Ltd',
        businessType: BusinessType.NEW,
        industryType: INDUSTRY_TYPES_SEED[0],
        rfq: {},
        client: { id: `CL-DEV-${stamp}`, name: 'Dev Float Missing RFQ Pvt Ltd' },
      };
    default:
      return {
        ...base,
        productType: 'GMC',
        businessName: 'Dev Float Foods Pvt Ltd',
        businessType: BusinessType.NEW,
        industryType: INDUSTRY_TYPES_SEED[0],
        rfq: {
          linkUrl: `https://example.test/bimasetu/rfq/${stamp}`,
          renderedViewUrl: `https://example.test/bimasetu/rfq/${stamp}/view`,
        },
        targetPremium: 1500000,
        noteToPlacement: null,
        client: { id: `CL-DEV-${stamp}`, name: 'Dev Float Foods Pvt Ltd', spoc: 'Dev Spoc' },
      };
  }
}
