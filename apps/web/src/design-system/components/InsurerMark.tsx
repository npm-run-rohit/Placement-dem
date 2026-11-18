/** Insurer logo (24px tall) or, without one, the insurer name (Insurer & Activity column). */
export function InsurerMark({
  name,
  logoUrl,
  size = 24,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
}) {
  if (logoUrl)
    return (
      <img
        src={logoUrl}
        alt={name}
        title={name}
        className="w-auto object-contain"
        style={{ height: size, maxWidth: size * 4 }}
      />
    );
  return <span className="text-dense font-semibold text-ink">{name}</span>;
}
