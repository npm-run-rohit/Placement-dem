import { FilterPills } from '@/design-system/components';
import type { TabProps } from '../TicketWorkspace';
import { InsurersTab } from './InsurersTab';
import { ThreadsTab } from './ThreadsTab';

export type ContactSub = 'insurers' | 'threads';

/**
 * Insurance Contact (UI-SPEC 3.3, decided 2026-10-29): Insurer Panel and Insurer Threads as sub-tabs of one tab,
 * as in the prototype. The URL keeps the sub-tab (/tickets/:no/insurers | /threads).
 */
export function ContactTab({
  ticket,
  sub,
  onSub,
}: TabProps & { sub: ContactSub; onSub: (s: ContactSub) => void }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-[-0.2px] text-ink">Insurance Contact</h2>
        <FilterPills<ContactSub>
          value={sub}
          onChange={onSub}
          items={[
            { key: 'insurers', label: 'Insurer Panel' },
            { key: 'threads', label: 'Insurer Threads' },
          ]}
        />
      </div>
      {sub === 'insurers' ? <InsurersTab ticket={ticket} /> : <ThreadsTab ticket={ticket} />}
    </div>
  );
}
