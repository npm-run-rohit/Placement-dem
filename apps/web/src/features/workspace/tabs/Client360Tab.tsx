import { Building2 } from 'lucide-react';
import { TabHeader } from './TabHeader';
import type { TabProps } from '../TicketWorkspace';

/** Client 360 (UI-SPEC 3.3.4): placeholder until the BimaSetu company 360 integration lands. */
export function Client360Tab(_props: TabProps) {
  return (
    <div>
      <TabHeader title="Client 360" meta="Syncing" />
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-line-subtle bg-white text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand">
          <Building2 size={20} />
        </span>
        <div className="text-sm font-semibold">Client 360 is syncing…</div>
        <p className="mt-1 max-w-sm text-meta text-ink-2">
          Company 360 is taking some time to load. Kindly wait till you receive an update.
        </p>
      </div>
    </div>
  );
}
