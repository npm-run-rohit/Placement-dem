import type { Tone } from '@bimaplacement/contracts';
import { tone as tones } from '../tokens';

/** Photo, else Instrument Serif italic initial on a tone tint (PlAvatar). */
export function Avatar({
  name,
  src,
  size = 22,
  tone = 'purple',
}: {
  name: string;
  src?: string | null;
  size?: number;
  tone?: Tone;
}) {
  if (src)
    return (
      <img
        src={src}
        alt={name}
        title={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  const t = tones[tone];
  return (
    <span
      title={name}
      className="inline-flex items-center justify-center rounded-full font-display italic"
      style={{ width: size, height: size, background: t.bg, color: t.fg, fontSize: size * 0.55 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
