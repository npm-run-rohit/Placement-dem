import { BusinessType, type FloatPayload } from '@bimaplacement/contracts';

/**
 * FR-282: product, business type and industry are taken as BimaSetu sends them; a float with no RFQ or a
 * missing required field is rejected with the reason. Returns null when the float can open a ticket.
 */
export function floatRejection(p: Partial<FloatPayload>, knownProducts: readonly string[]): string | null {
  const missing = [
    !p.lineRef && 'line reference',
    !p.businessName?.trim() && 'business name',
    !p.productType && 'product',
    !p.businessType && 'business type',
    !p.industryType?.trim() && 'industry type',
    !p.rm?.email && 'RM',
  ].filter(Boolean);
  if (missing.length) return `Missing ${missing.join(', ')}`;
  if (!p.rfq?.linkUrl && !p.rfq?.excel?.downloadUrl) return 'No RFQ: send the RFQ link and/or Excel';
  if (p.rfq?.linkUrl && !/^https?:\/\//.test(p.rfq.linkUrl))
    return 'RFQ link must start with http:// or https://';
  if (!knownProducts.includes(p.productType!))
    return `Product ${p.productType} is not mapped to a Placement product`;
  if (!Object.values(BusinessType).includes(p.businessType!))
    return `Business type ${p.businessType} is not New, Renewal or Rollover`;
  if (p.businessType === BusinessType.RENEWAL && !p.renewalDate) return 'Missing renewal date for a Renewal';
  return null;
}
