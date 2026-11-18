/** Business-minute durations: 540 BM = 1 business day (PRD 8.1). Copy rule: capitalised units, no em dashes. */
export function fmtBizMins(mins: number): string {
  const m = Math.round(Math.abs(mins));
  if (m >= 540) return `${(m / 540).toFixed(1).replace(/\.0$/, '')}d`;
  if (m >= 60) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${m}m`;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const fmtInr = (v?: number | null) => (v == null ? '-' : `₹${inr.format(v)}`);
/** ₹78 L / ₹1.2 Cr */
export const fmtInrShort = (v?: number | null) => {
  if (v == null) return '-';
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
  return fmtInr(v);
};

export const fmtWhen = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '-';

export const stripCompanySuffix = (name: string) =>
  name.replace(/\s+(Pvt\.?\s*Ltd\.?|Private Limited|Ltd\.?|LLP)$/i, '');
