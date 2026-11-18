import { signBimaSetu, verifyBimaSetuSignature } from './hmac';

describe('BimaSetu webhook signature', () => {
  const body = JSON.stringify({ messageId: 'm1', type: 'float' });
  it('accepts a valid signature', () => {
    const h = signBimaSetu(body, 's3cret', 1_000);
    expect(verifyBimaSetuSignature(body, h, 's3cret', 300, 1_100)).toBe(true);
  });
  it('rejects tampering and replays', () => {
    const h = signBimaSetu(body, 's3cret', 1_000);
    expect(verifyBimaSetuSignature(body + ' ', h, 's3cret', 300, 1_100)).toBe(false);
    expect(verifyBimaSetuSignature(body, h, 's3cret', 300, 2_000)).toBe(false);
  });
});
