import { insurerSubjectRef, renderTemplate } from './template-renderer';

describe('templates', () => {
  it('renders INS-T01 style subjects', () => {
    expect(
      renderTemplate('[{{TicketID}} | {{ThreadID}}] RFQ - {{Client}} - {{ProductType}}', {
        TicketID: 'PLC-1001',
        ThreadID: 'TH-01',
        Client: 'Acme',
        ProductType: 'GMC',
      }),
    ).toBe('[PLC-1001 | TH-01] RFQ - Acme - GMC');
  });
  it('builds the subject ref', () => {
    expect(insurerSubjectRef('PLC-1001', 'TH-02')).toBe('[PLC-1001 | TH-02]');
  });
});
