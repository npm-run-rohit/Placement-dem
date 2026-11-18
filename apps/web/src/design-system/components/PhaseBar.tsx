import { indicator } from '../tokens';
import { PHASES } from '@bimaplacement/contracts';

/** PlPhaseBar: 6 phases; done = green, current = 55% caution (red if internal breach), future empty. */
export function PhaseBar({ current, breached }: { current: number; breached?: boolean }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {PHASES.map((p, i) => (
        <div key={p}>
          <div className="h-[3px] overflow-hidden rounded-full bg-line-soft">
            <div
              className="h-full rounded-full"
              style={{
                width: i < current ? '100%' : i === current ? '55%' : '0%',
                background:
                  i < current
                    ? indicator.success.dot
                    : breached
                      ? indicator.error.dot
                      : indicator.caution.dot,
              }}
            />
          </div>
          <div className={`mt-2 text-[13.5px] ${i === current ? 'font-semibold text-ink' : 'text-ink-2'}`}>
            {p}
          </div>
        </div>
      ))}
    </div>
  );
}
