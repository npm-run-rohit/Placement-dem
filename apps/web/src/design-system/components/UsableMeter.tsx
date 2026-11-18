/** PlUsableMeter: pips + n/3 usable distinct insurers. */
export function UsableMeter({ count, target = 3 }: { count: number; target?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {Array.from({ length: target }).map((_, i) => (
          <span key={i} className={`h-2 w-5 rounded-full ${i < count ? 'bg-t-green' : 'bg-line-soft'}`} />
        ))}
      </div>
      <span className="num text-dense font-semibold">
        {count}/{target}
      </span>
      <span className="text-meta text-ink-2">usable · distinct insurers</span>
    </div>
  );
}
