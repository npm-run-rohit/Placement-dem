import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed webhooks (Architecture plan W3): header `x-bimasetu-signature: t=<unix>,v1=<hex hmac-sha256>`
 * over `${t}.${rawBody}`; reject if |now - t| > tolerance (replay protection). Format is our proposal.
 */
export function verifyBimaSetuSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  toleranceSec: number,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(nowSec - t) > toleranceSec || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signBimaSetu(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`;
}
