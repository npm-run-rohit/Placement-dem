import { conversationRefFor } from './conversation-ref';

describe('conversationRefFor', () => {
  it('keys an insurer thread on ticket and thread ref', () => {
    expect(conversationRefFor('PLC-1018', 'TH-02')).toBe('PLC-1018/TH-02');
  });
  it('keys RM mail on the ticket alone', () => {
    expect(conversationRefFor('PLC-1018', null)).toBe('PLC-1018/RM');
  });
});
