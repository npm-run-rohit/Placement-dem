/** FR-236 / BR-068: decision-support flag only, never auto-rejects (BR-057). */
export type TargetFlag = 'Target Met' | 'Above Target' | 'Target Not Available';

export function targetFlag(
  targetPremium: number | null | undefined,
  premium: number | null | undefined,
): TargetFlag {
  if (
    targetPremium == null ||
    premium == null ||
    !Number.isFinite(targetPremium) ||
    !Number.isFinite(premium)
  )
    return 'Target Not Available';
  return premium <= targetPremium ? 'Target Met' : 'Above Target';
}

/**
 * Normalise "₹78 L", "1.2 Cr", "78,00,000", "50 lakh" -> INR integer; <=0 / junk -> null
 * (prototype plNormTargetPremium). Used for BimaSetu floats that send text.
 */
export function normaliseInr(input: unknown): number | null {
  if (typeof input === 'number') return input > 0 ? Math.round(input) : null;
  if (typeof input !== 'string') return null;
  const s = input.toLowerCase().replace(/[₹,\s]/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(cr|crore|crores|l|lakh|lakhs|lac|k)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = m[2]?.startsWith('cr')
    ? 1e7
    : m[2] && ['l', 'lakh', 'lakhs', 'lac'].includes(m[2])
      ? 1e5
      : m[2] === 'k'
        ? 1e3
        : 1;
  const v = Math.round(n * mult);
  return v > 0 ? v : null;
}
