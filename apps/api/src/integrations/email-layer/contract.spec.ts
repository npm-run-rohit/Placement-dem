import { signEmailLayer, verifyEmailLayerSignature } from './contract';

describe('email layer signature', () => {
  const body = '{"a":1}';

  it('accepts a fresh signature', () => {
    expect(verifyEmailLayerSignature(body, signEmailLayer(body, 's', 1000), 's', 300, 1100)).toBe(true);
  });

  it('rejects a signature outside the tolerance', () => {
    expect(verifyEmailLayerSignature(body, signEmailLayer(body, 's', 1000), 's', 300, 1400)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyEmailLayerSignature(body, signEmailLayer(body, 's', 1000), 'x', 300, 1100)).toBe(false);
  });

  it('rejects a header with no v1', () => {
    expect(verifyEmailLayerSignature(body, 't=1000', 's', 300, 1100)).toBe(false);
  });
});
