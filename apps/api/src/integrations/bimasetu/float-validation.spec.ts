import type { FloatPayload } from '@bimaplacement/contracts';
import { floatRejection } from './float-validation';

const PRODUCTS = ['GMC', 'FIRE_FACTORY'];
const ok: Partial<FloatPayload> = {
  lineRef: 'BS-LINE-1',
  businessName: 'Acme Foods Pvt Ltd',
  productType: 'GMC',
  businessType: 'New' as FloatPayload['businessType'],
  industryType: 'Manufacturing',
  rm: { id: 'rm-1', name: 'R M', email: 'rm@x.test' },
  rfq: { linkUrl: 'https://example.test/rfq' },
};

describe('floatRejection (FR-282)', () => {
  it('accepts a complete float with an RFQ link', () => {
    expect(floatRejection(ok, PRODUCTS)).toBeNull();
  });

  it('rejects a float with no RFQ', () => {
    expect(floatRejection({ ...ok, rfq: {} }, PRODUCTS)).toMatch(/No RFQ/);
  });

  it('names every missing required field', () => {
    expect(floatRejection({ ...ok, businessName: ' ', industryType: undefined }, PRODUCTS)).toBe(
      'Missing business name, industry type',
    );
  });

  it('rejects a product Placement cannot map, and a Renewal without its date', () => {
    expect(floatRejection({ ...ok, productType: 'PET' }, PRODUCTS)).toMatch(/not mapped/);
    expect(
      floatRejection({ ...ok, businessType: 'Renewal' as FloatPayload['businessType'] }, PRODUCTS),
    ).toMatch(/renewal date/);
  });
});
