import { PRODUCT_TYPES_SEED, ProductTypeCode as P } from '@bimaplacement/contracts';
import { matchProductTypes, parseSubjectRefs } from './product-matcher';

const match = (text: string) => matchProductTypes(text, PRODUCT_TYPES_SEED).sort();

describe('inbound mail references', () => {
  it('parses ticket and thread refs from a reply subject', () => {
    expect(parseSubjectRefs('RE: [PLC-1042 | TH-03] RFQ - Acme Pvt Ltd - GMC')).toEqual({
      ticketNo: 'PLC-1042',
      threadRef: 'TH-03',
    });
  });
  it('returns nothing for unrelated mail', () => {
    expect(parseSubjectRefs('Lunch?')).toEqual({ ticketNo: undefined, threadRef: undefined });
  });
});

describe('matchProductTypes (FR-230)', () => {
  it('matches names and aliases, longest phrase first', () => {
    expect(match('Quote for Group Mediclaim renewal')).toEqual([P.GMC]);
    expect(match('PI Tech and D&O terms attached')).toEqual([P.DNO, P.PI_TECH].sort());
  });
  it('treats short all-caps aliases as case-sensitive', () => {
    expect(match('car parking and stop work order, gmc')).toEqual([]);
    expect(match('CAR and GMC')).toEqual([P.CAR, P.GMC].sort());
  });
  it('splits Fire by Factory/Plant vs Warehouse/Godown, both when neither', () => {
    expect(match('Fire quote for the plant')).toEqual([P.FIRE_FACTORY]);
    expect(match('Fire cover for 3 godowns')).toEqual([P.FIRE_GODOWN]);
    expect(match('Fire policy terms')).toEqual([P.FIRE_FACTORY, P.FIRE_GODOWN].sort());
  });
  it('splits PI by engineering wording', () => {
    expect(match('PI quote for an engineering consultancy')).toEqual([P.PI_ENGG]);
    expect(match('Professional Indemnity for a SaaS firm')).toEqual([P.PI_TECH]);
  });
  it('maps ACT Policy / Public Liability Act to PL Act and keeps Public Liability next to Fire', () => {
    expect(match('Public Liability Act renewal')).toEqual([P.PL_ACT]);
    expect(match('ACT Policy wording')).toEqual([P.PL_ACT]);
    expect(match('Fire Factory with Public Liability')).toEqual([P.FIRE_FACTORY, P.PL_GEN].sort());
  });
  it('drops Burglary and MBD when a Fire type matches; Money / Fidelity / FLOP never match', () => {
    expect(match('Fire Factory, Burglary and Machinery Breakdown')).toEqual([P.FIRE_FACTORY]);
    expect(match('Burglary only')).toEqual([P.BURGLARY]);
    expect(match('Money insurance, Fidelity Guarantee and FLOP')).toEqual([]);
  });
});
