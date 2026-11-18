import { ProductTypeCode } from '@bimaplacement/contracts';

/**
 * Product-type alias matcher for inbound mail (FR-230) - SUGGESTS only, the PM confirms (BR-119).
 * Rules (from PRD + prototype plMatchProductTypes):
 *  - longest phrase first, word boundaries; short ALL-CAPS aliases (GMC, GPA, GTL, CGL, DNO, PI, WC,
 *    IAR, MBD, CAR, EAR, BGR, STOP) are case-sensitive
 *  - Fire: FIRE_FACTORY if factory/plant, FIRE_GODOWN if warehouse/godown, BOTH if neither word
 *  - PI: PI_ENGG for "PI Engg"/engineering wording, else PI_TECH
 *  - "ACT Policy" / "Public Liability Act" -> PL_ACT; general "Public Liability" -> PL_GEN;
 *    Public Liability is NOT dropped when a Fire type matches
 *  - BURGLARY and MBD_EEP are dropped when a Fire type matches
 *  - Money, Fidelity Guarantee, FLOP never match
 */
export function matchProductTypes(
  text: string,
  aliases: Array<{ code: ProductTypeCode; aliases: string[] }>,
): ProductTypeCode[] {
  const phrases = aliases
    .flatMap((p) => p.aliases.map((alias) => ({ code: p.code, alias })))
    .sort((a, b) => b.alias.length - a.alias.length); // longest phrase first
  let rest = text;
  const found = new Set<ProductTypeCode>();
  for (const { code, alias } of phrases) {
    const caseSensitive = alias.length <= 5 && alias === alias.toUpperCase();
    const re = new RegExp(`(?<![\\w&])${escapeRe(alias)}(?![\\w&])`, caseSensitive ? 'g' : 'gi');
    if (re.test(rest)) {
      found.add(code);
      rest = rest.replace(re, ' '); // consumed: "Public Liability Act" never also counts as "Public Liability"
    }
  }
  // PI: engineering wording -> PI Engg, otherwise PI Tech
  if (found.has(ProductTypeCode.PI_TECH) && /\bengg\b|engineering/i.test(text)) {
    found.delete(ProductTypeCode.PI_TECH);
    found.add(ProductTypeCode.PI_ENGG);
  }
  // Fire: Factory/Plant vs Warehouse/Godown, both when neither word is present
  if (
    /\bfire\b/i.test(text) &&
    !found.has(ProductTypeCode.FIRE_FACTORY) &&
    !found.has(ProductTypeCode.FIRE_GODOWN)
  ) {
    const factory = /\b(factory|plant)s?\b/i.test(text);
    const godown = /\b(warehouse|godown)s?\b/i.test(text);
    if (factory || !godown) found.add(ProductTypeCode.FIRE_FACTORY);
    if (godown || !factory) found.add(ProductTypeCode.FIRE_GODOWN);
  }
  if (found.has(ProductTypeCode.FIRE_FACTORY) || found.has(ProductTypeCode.FIRE_GODOWN)) {
    found.delete(ProductTypeCode.BURGLARY);
    found.delete(ProductTypeCode.MBD_EEP);
  }
  return [...found];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Extracts [PLC-nnnn | TH-nn] references from a subject (FR-050, FR-070). */
export function parseSubjectRefs(subject: string): { ticketNo?: string; threadRef?: string } {
  const ticket = subject.match(/\bPLC-\d{4,}\b/i)?.[0]?.toUpperCase();
  const thread = subject.match(/\bTH-\d{2,}\b/i)?.[0]?.toUpperCase();
  return { ticketNo: ticket, threadRef: thread };
}
