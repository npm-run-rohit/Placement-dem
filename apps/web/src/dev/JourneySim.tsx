import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api-client';
import { DevSimBlock, DevSimBtn, useDevTools } from './DevTools';

/** One step the journey simulator took (POST /dev/tickets/:id/simulate/next | run). */
interface JourneyStep {
  step: string;
  detail: string;
  stage: string;
}

/**
 * DEV ONLY (demo): drive a ticket through its journey one step at a time, or run it to "QCR sent" / close.
 * Every step goes through the real services; insurer replies also land in Mailpit. Hidden with the dev tools.
 */
export function JourneySim({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const qc = useQueryClient();
  const { reportError } = useDevTools();
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const call = useMutation({
    mutationFn: async (what: 'next' | 'qcr_released' | 'closed'): Promise<JourneyStep[]> => {
      if (what === 'next') {
        const r = await api<JourneyStep & { done: boolean }>(`/dev/tickets/${ticketId}/simulate/next`, {
          method: 'POST',
          json: {},
        });
        return [r];
      }
      const r = await api<{ steps: JourneyStep[] }>(`/dev/tickets/${ticketId}/simulate/run`, {
        method: 'POST',
        json: { until: what },
      });
      return r.steps.length ? r.steps : [{ step: 'Already there', detail: '', stage: what }];
    },
    onSuccess: (s) => setSteps((prev) => [...prev, ...s].slice(-12)),
    onError: reportError,
    onSettled: () => qc.invalidateQueries(),
  });
  const busy = call.isPending;
  return (
    <DevSimBlock title="Simulate Journey">
      <DevSimBtn disabled={busy || closed} onClick={() => call.mutate('next')}>
        Next Step
      </DevSimBtn>
      <DevSimBtn disabled={busy || closed} onClick={() => call.mutate('qcr_released')}>
        Run to QCR Sent
      </DevSimBtn>
      <DevSimBtn disabled={busy || closed} onClick={() => call.mutate('closed')}>
        Run to Close
      </DevSimBtn>
      {busy && <span className="self-center text-[11.5px] text-t-amber">Running…</span>}
      {steps.length > 0 && (
        <ol className="mt-1 w-full list-decimal space-y-0.5 pl-5 text-[11.5px] text-ink-2">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="font-550 text-ink">{s.step}</span>
              {s.detail && <span className="text-ink-3"> · {s.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </DevSimBlock>
  );
}

/** DEV ONLY (demo): a fresh manual ticket run to "QCR sent" (QCR mail to the RM in Mailpit), then opened. */
export function NewDemoTicket() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { reportError } = useDevTools();
  const create = useMutation({
    mutationFn: () =>
      api<{ ticketId: string; ticketNo: string; steps: JourneyStep[] }>('/dev/simulate/journey', {
        method: 'POST',
        json: { channel: 'manual', until: 'qcr_released' },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      nav(`/tickets/${r.ticketNo}`);
    },
    onError: reportError,
  });
  return (
    <DevSimBlock title="Simulate Journey">
      <DevSimBtn disabled={create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? 'Creating…' : 'New Demo Ticket'}
      </DevSimBtn>
    </DevSimBlock>
  );
}
