import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, Database, EyeOff, RotateCcw, Zap } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api-client';

/**
 * DEV ONLY: the prototype's amber "Simulate" blocks and engine-time chip, backed by /api/v1/dev/*.
 * Available under `next dev`, or in a hosted demo build made with NEXT_PUBLIC_DEV_TOOLS=true (infra/demo);
 * never in production builds or the static preview. Off with NEXT_PUBLIC_DEV_TOOLS=false.
 * Viewers can hide them; the choice is remembered per browser.
 */
const AVAILABLE =
  (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEV_TOOLS === 'true') &&
  process.env.NEXT_PUBLIC_DEV_TOOLS !== 'false' &&
  process.env.NEXT_PUBLIC_DEMO !== 'true';
const STORAGE_KEY = 'bimaplacement.devTools.hidden';

const DevToolsContext = createContext<{
  visible: boolean;
  setHidden: (hidden: boolean) => void;
  reportError: (e: unknown) => void;
}>({ visible: false, setHidden: () => {}, reportError: () => {} });
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DevToolsProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(false);
  // a refused simulated event must be visible: a silent no-op looks like a broken button
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error]);
  const reportError = (e: unknown) => setError(errorText(e));
  useEffect(() => {
    try {
      setHiddenState(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const setHidden = (h: boolean) => {
    setHiddenState(h);
    try {
      localStorage.setItem(STORAGE_KEY, h ? '1' : '0');
    } catch {
      /* storage blocked: session-only */
    }
  };
  return (
    <DevToolsContext.Provider value={{ visible: AVAILABLE && !hidden, setHidden, reportError }}>
      {children}
      {AVAILABLE && error && (
        <div
          role="alert"
          className="fixed bottom-16 right-6 z-[101] flex max-w-[420px] items-start gap-2 rounded-xl border border-t-red-line bg-t-red-soft px-3 py-2 text-dense text-t-red shadow-popover"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Simulator refused: {error}</span>
        </div>
      )}
      {AVAILABLE &&
        (hidden ? (
          <ShowDevToolsPill onShow={() => setHidden(false)} />
        ) : (
          <EngineChip onHide={() => setHidden(true)} onError={reportError} />
        ))}
    </DevToolsContext.Provider>
  );
}

export const useDevTools = () => useContext(DevToolsContext);

/** PlSimBlock: amber dashed panel; renders nothing unless dev tools are visible. */
export function DevSimBlock({ title, children }: { title: string; children: ReactNode }) {
  if (!useDevTools().visible) return null;
  return (
    <div className="mt-3 rounded-xl border border-dashed border-t-amber-line bg-t-amber-soft px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-650 tracking-[0.2px] text-t-amber">
        <Zap size={12} /> {title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** PlSimBtn */
export function DevSimBtn({
  onClick,
  children,
  disabled,
  title,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg border border-dashed border-t-amber-line bg-white px-2.5 py-1 text-[11.5px] font-550 text-t-amber disabled:cursor-not-allowed disabled:bg-card-sunk disabled:text-ink-3"
    >
      {children}
    </button>
  );
}

/** A dev simulator call: POST to /dev/... (or any API path), then refresh every query; a refusal is shown. */
export function useDevAction(path: string) {
  const qc = useQueryClient();
  const { reportError } = useDevTools();
  return useMutation({
    mutationFn: (body: object = {}) => api(path, { method: 'POST', json: body }),
    onSuccess: () => qc.invalidateQueries(),
    onError: reportError,
  });
}

const STEPS = [
  { label: '+ 30 min', businessMinutes: 30 },
  { label: '+ 1 BH', businessMinutes: 60 },
  { label: '+ 1 BD', businessMinutes: 540 },
  { label: '+ 3 BD', businessMinutes: 1620 },
  { label: '+ 1 WD', businessMinutes: 540 * 5 },
];

const fmtEngine = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
    .formatToParts(new Date(iso))
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);

/** PlEngineChip: engine time (API clock) with business-time steps; each step runs the SLA sweep. */
function EngineChip({ onHide, onError }: { onHide: () => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const engine = useQuery({
    queryKey: ['dev', 'clock'],
    queryFn: () => api<{ now: string; offsetMins: number; demoReset?: boolean }>('/dev/clock'),
    refetchInterval: 60_000,
  });
  // hosted QA demo: wipe and reload the fixtures (two clicks), then wait for the API to come back and reload
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const demoReset = useMutation({
    mutationFn: () => api('/dev/demo/reset', { method: 'POST', json: {} }),
    onSuccess: () => {
      setOpen(false);
      setResetting(true);
    },
    onError,
  });
  useEffect(() => {
    if (!resetting) return;
    let stopped = false;
    const started = Date.now();
    const poll = async () => {
      if (stopped) return;
      // give the supervisor time to stop the old API before treating an answer as "back"
      if (Date.now() - started > 10_000) {
        try {
          await api('/dev/clock');
          window.location.assign('/');
          return;
        } catch {
          /* still resetting */
        }
      }
      if (Date.now() - started > 5 * 60_000) {
        setResetting(false);
        onError(new Error('The demo did not come back after 5 minutes. Reload the page.'));
        return;
      }
      setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [resetting]); // eslint-disable-line react-hooks/exhaustive-deps -- onError changes identity every render; polling must not restart
  const move = useMutation({
    mutationFn: (body: { businessMinutes?: number } | 'reset') =>
      body === 'reset'
        ? api('/dev/clock/reset', { method: 'POST', json: {} })
        : api('/dev/clock/advance', { method: 'POST', json: body }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries();
    },
    onError,
  });
  if (resetting)
    return (
      <div className="fixed inset-0 z-[102] flex items-center justify-center bg-black/30">
        <div role="status" className="rounded-xl bg-white px-5 py-4 text-sm text-ink shadow-popover">
          Resetting demo data. The app reloads in about a minute.
        </div>
      </div>
    );
  if (engine.isError) return null; // API without dev simulators (FEATURE_DEV_SIMULATORS=false)
  const p = engine.data ? fmtEngine(engine.data.now) : null;

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      {open && (
        <div className="mb-1.5 min-w-[184px] overflow-hidden rounded-xl border border-line-subtle bg-white shadow-popover">
          {STEPS.map((s) => (
            <button
              key={s.label}
              onClick={() => move.mutate({ businessMinutes: s.businessMinutes })}
              disabled={move.isPending}
              className="block w-full border-b border-line-subtle px-3 py-2 text-left text-xs text-ink hover:bg-canvas"
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={() => move.mutate('reset')}
            disabled={move.isPending || !engine.data?.offsetMins}
            className="flex w-full items-center gap-1.5 border-b border-line-subtle px-3 py-2 text-left text-xs text-ink-2 hover:bg-canvas disabled:text-ink-3"
          >
            <RotateCcw size={12} /> Back to real time
          </button>
          {engine.data?.demoReset && (
            <button
              onClick={() => (confirmReset ? demoReset.mutate() : setConfirmReset(true))}
              onMouseLeave={() => setConfirmReset(false)}
              disabled={demoReset.isPending}
              className="flex w-full items-center gap-1.5 border-b border-line-subtle px-3 py-2 text-left text-xs text-t-red hover:bg-canvas"
            >
              <Database size={12} /> {confirmReset ? 'Click again to wipe all data' : 'Reset demo data'}
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onHide();
            }}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-ink-2 hover:bg-canvas"
          >
            <EyeOff size={12} /> Hide dev tools
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Engine time - advance to test SLAs (dev only)"
        className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-[11.5px] font-semibold tracking-[0.2px] text-white shadow-popover"
      >
        <Clock size={12} />
        <span className="num">{p ? `${p.day} ${p.month} ${p.hour}:${p.minute} · ${p.weekday}` : '…'}</span>
        {!!engine.data?.offsetMins && (
          <span className="opacity-70">(+{Math.round(engine.data.offsetMins / 60)}h)</span>
        )}
        <span className="ml-1 opacity-70">▾</span>
      </button>
    </div>
  );
}

function ShowDevToolsPill({ onShow }: { onShow: () => void }) {
  return (
    <button
      onClick={onShow}
      title="Show dev tools (simulators and engine time)"
      className="fixed bottom-6 right-6 z-[100] rounded-full border border-dashed border-t-amber-line bg-white px-2 py-0.5 text-[10.5px] font-550 text-t-amber shadow-menu"
    >
      Dev
    </button>
  );
}
