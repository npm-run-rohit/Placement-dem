import { Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRODUCT_TYPES_SEED, type InsurerMasterRow, type MasterChangeView } from '@bimaplacement/contracts';
import { Button, Chip, Drawer, FilterPills, InsurerMark } from '@/design-system/components';
import { useMe } from '@/api/hooks';
import { PageHead } from '@/shell/PageHead';
import { api } from '@/lib/api-client';
import { ChangeLogList } from '@/features/admin/ChangeLogList';

type Group = 'EB' | 'Liability' | 'P&C';
const GROUPS: Group[] = ['EB', 'Liability', 'P&C'];
const shortOf = (code: string) => PRODUCT_TYPES_SEED.find((p) => p.code === code)?.short ?? code;
const STATUS_TONE: Record<string, 'green' | 'neutral' | 'red'> = {
  Active: 'green',
  Inactive: 'neutral',
  'Do Not Float': 'red',
};

/** Insurer Master (UI-SPEC 3.5, FR-160..162): routing master, Head edits, everyone else reads. */
export function InsurerMasterPage() {
  const { isHead } = useMe();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<InsurerMasterRow | 'new' | null>(null);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['insurer-master'],
    queryFn: () => api<InsurerMasterRow[]>('/insurers/master'),
  });
  const { data: changes = [] } = useQuery({
    queryKey: ['insurer-master', 'change-log'],
    queryFn: () => api<MasterChangeView[]>('/insurers/change-log'),
  });
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      (r.branch?.name ?? '').toLowerCase().includes(needle),
  );

  return (
    <div className="px-6 py-6">
      <PageHead
        title="Insurer Master"
        hint="Routing key is Insurer + Branch + Product Group. Every POC gets every mail."
        right={
          <div className="flex items-center gap-2">
            {isHead ? (
              <Chip tone="purple">Placement Head · can edit</Chip>
            ) : (
              <Chip>Read-only · Placement Head maintains the master</Chip>
            )}
            <label className="flex h-8 w-[200px] items-center gap-2 rounded-lg border-[0.5px] border-line bg-white px-2.5 text-dense">
              <Search size={14} className="text-ink-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search insurers..."
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
              />
            </label>
            {isHead && (
              <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>
                Add Insurer
              </Button>
            )}
          </div>
        }
      />

      <div className="overflow-x-auto rounded-xl border-[0.5px] border-line">
        <table className="w-full text-left text-dense">
          <thead className="bg-card-alt text-meta font-semibold text-ink-2">
            <tr>
              <th className="px-3 py-2">Insurer</th>
              <th className="px-3 py-2">Products</th>
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2">POCs</th>
              <th className="px-3 py-2">Status</th>
              {isHead && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-3 py-4 text-ink-2" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && !shown.length && (
              <tr>
                <td className="px-3 py-4 text-ink-2" colSpan={6}>
                  {needle ? `No insurer matches "${q.trim()}".` : 'No insurers on the master yet.'}
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr
                key={`${r.insurerId}-${r.branch?.id ?? 'none'}`}
                className="border-t border-line-soft align-top"
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {r.logoUrl && <InsurerMark name={r.name} logoUrl={r.logoUrl} size={20} />}
                    <span className="text-[12.5px] font-semibold text-ink">{r.name}</span>
                  </div>
                  {r.note && <div className="mt-0.5 text-[11px] text-ink-3">{r.note}</div>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex max-w-[280px] flex-wrap gap-1">
                    {r.appetite.length ? (
                      r.appetite.map((c) => (
                        <Chip key={c} size="xs">
                          {shortOf(c)}
                        </Chip>
                      ))
                    ) : (
                      <span className="text-ink-3">-</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-ink">{r.branch?.name || '-'}</td>
                <td className="px-3 py-3">
                  {GROUPS.filter((g) => r.pocs[g].length).map((g) => (
                    <div key={g} className="text-meta text-ink-2">
                      <span className="font-semibold text-ink">{g}:</span>{' '}
                      {r.pocs[g].map((p) => p.name).join(', ')}
                    </div>
                  ))}
                  {!GROUPS.some((g) => r.pocs[g].length) && (
                    <span className="text-meta text-ink-3">No POCs</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {r.branch?.status === 'Inactive' && r.status === 'Active' ? (
                    <Chip dot>Branch inactive</Chip>
                  ) : (
                    <Chip dot tone={STATUS_TONE[r.status] ?? 'neutral'}>
                      {r.status}
                    </Chip>
                  )}
                </td>
                {isHead && (
                  <td className="px-3 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil size={12} />}
                      onClick={() => setEditing(r)}
                    >
                      Edit
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-6 rounded-xl border-[0.5px] border-line p-4">
        <h2 className="mb-3 text-base font-semibold text-ink">Change log</h2>
        <ChangeLogList changes={changes} />
      </section>

      {editing && <EditDrawer row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const pocsToText = (list: InsurerMasterRow['pocs'][Group]) =>
  list.map((p) => `${p.name} <${p.email}>`).join('\n');
/** One POC per line (or comma separated): "Name <email>" or just the email. */
function parsePocs(text: string): Array<{ name: string; email: string }> {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*<([^>]+)>$/);
      if (m) return { name: m[1].trim() || m[2].split('@')[0], email: m[2].trim() };
      return { name: s.split('@')[0], email: s };
    });
}

/** PlInsurerEditDrawer (UI-SPEC 4): insurer fields + appetite grid + branch + POCs per group. Head only. */
function EditDrawer({ row, onClose }: { row: InsurerMasterRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(row?.name ?? '');
  const [sectors, setSectors] = useState(row?.sectors ?? '');
  const [note, setNote] = useState(row?.note ?? '');
  const [status, setStatus] = useState(row?.status ?? 'Active');
  const [appetite, setAppetite] = useState<string[]>(row?.appetite ?? []);
  const [branchName, setBranchName] = useState(row?.branch?.name ?? '');
  const [branchStatus, setBranchStatus] = useState(row?.branch?.status ?? 'Active');
  const [pocText, setPocText] = useState<Record<Group, string>>({
    EB: pocsToText(row?.pocs.EB ?? []),
    Liability: pocsToText(row?.pocs.Liability ?? []),
    'P&C': pocsToText(row?.pocs['P&C'] ?? []),
  });

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        name: name.trim(),
        sectors: sectors.trim() || null,
        note: note.trim() || null,
        status,
        appetite,
      };
      const insurerId = row
        ? row.insurerId
        : (await api<{ id: string }>('/insurers', { method: 'POST', json: fields })).id;
      if (row) await api(`/insurers/${insurerId}`, { method: 'PATCH', json: fields });
      const branchId =
        row?.branch?.id ??
        (await api<InsurerMasterRow[]>('/insurers/master')).find((r) => r.insurerId === insurerId)?.branch
          ?.id;
      const pocs = Object.fromEntries(GROUPS.map((g) => [g, parsePocs(pocText[g])]));
      if (branchId)
        await api(`/insurers/${insurerId}/branches/${branchId}`, {
          method: 'PATCH',
          json: { name: branchName, status: branchStatus, pocs },
        });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      onClose();
    },
  });

  const label = 'mb-1 block text-meta font-semibold text-ink-2';
  const input =
    'w-full rounded-lg border-[0.5px] border-line bg-white px-3 py-2 text-dense text-ink outline-none focus:border-brand';
  return (
    <Drawer
      title="Insurer Master · edit"
      subtitle={row ? [row.name, row.branch?.name].filter(Boolean).join(' · ') : 'New insurer'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={label}>Insurer name</label>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={label}>Sectors written</label>
          <input className={input} value={sectors} onChange={(e) => setSectors(e.target.value)} />
        </div>
        <div>
          <label className={label}>Underwriter note</label>
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div>
          <label className={label}>Insurer status · applies to every branch</label>
          <FilterPills
            value={status}
            onChange={setStatus}
            items={['Active', 'Inactive', 'Do Not Float'].map((s) => ({ key: s, label: s }))}
          />
        </div>
        <div>
          <label className={label}>Appetite</label>
          <div className="grid grid-cols-3 gap-1.5">
            {PRODUCT_TYPES_SEED.map((p) => {
              const on = appetite.includes(p.code);
              return (
                <label
                  key={p.code}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border-[0.5px] px-2 py-1.5 text-meta ${on ? 'border-brand bg-[rgba(65,0,207,0.06)] text-brand' : 'border-line text-ink-2'}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setAppetite((a) => (on ? a.filter((c) => c !== p.code) : [...a, p.code]))}
                    className="accent-brand"
                  />
                  {p.short}
                </label>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Branch name</label>
            <input
              className={input}
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="Blank means the insurer as a whole"
            />
          </div>
          <div>
            <label className={label}>Branch status</label>
            <FilterPills
              value={branchStatus}
              onChange={setBranchStatus}
              items={['Active', 'Inactive'].map((s) => ({ key: s, label: s }))}
            />
          </div>
        </div>
        {GROUPS.map((g) => (
          <div key={g}>
            <label className={label}>{g} POCs · one per line, "Name &lt;email&gt;"</label>
            <textarea
              className={`${input} min-h-[64px] font-mono text-meta`}
              value={pocText[g]}
              onChange={(e) => setPocText((t) => ({ ...t, [g]: e.target.value }))}
            />
          </div>
        ))}
        {save.error && <div className="text-dense text-t-red">{(save.error as Error).message}</div>}
      </div>
    </Drawer>
  );
}
