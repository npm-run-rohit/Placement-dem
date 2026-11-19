import clsx from 'clsx';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EDITABLE_LOOKUP_KINDS,
  QuoteTargetScenario,
  TimingLob,
  type AdminMastersView,
  type EditableLookupKind,
} from '@bimaplacement/contracts';
import { Button, Chip, FilterPills, SectionCard } from '@/design-system/components';
import { api } from '@/lib/api-client';

const input =
  'rounded-lg border-[0.5px] border-line bg-white px-2.5 py-1.5 text-dense text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-meta font-semibold text-ink-2';
const th = 'px-3 py-2';
const td = 'px-3 py-2.5';

/**
 * Every admin write returns the refreshed view (without mailbox status, which only the page load asks the
 * mail provider for); each section keeps its own error.
 */
function useAdminSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, json }: { path: string; method: 'POST' | 'PUT' | 'PATCH'; json: unknown }) =>
      api<AdminMastersView>(`/masters${path}`, { method, json }),
    onSuccess: (view) => {
      qc.setQueryData<AdminMastersView>(['masters', 'admin'], (prev) => ({
        ...view,
        mailboxes: view.mailboxes !== undefined ? view.mailboxes : (prev?.mailboxes ?? null),
      }));
      qc.invalidateQueries({ queryKey: ['masters', 'change-log'] });
    },
  });
}

function SaveError({ error }: { error: unknown }) {
  return error ? <div className="mt-2 text-dense text-t-red">{(error as Error).message}</div> : null;
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border-[0.5px] border-line">
      <table className="w-full text-left text-dense">
        <thead className="bg-card-alt text-meta font-semibold text-ink-2">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- SLA master (FR-139)

export function SlaSection({ view }: { view: AdminMastersView }) {
  const save = useAdminSave();
  return (
    <>
      <Table head={['SLA', 'Touchpoint', 'Owner', 'Clock', 'Target', 'Business Minutes', '']}>
        {view.sla.map((s) => (
          <SlaRow key={s.id} row={s} save={save} />
        ))}
      </Table>
      <SaveError error={save.error} />
    </>
  );
}

function SlaRow({
  row,
  save,
}: {
  row: AdminMastersView['sla'][number];
  save: ReturnType<typeof useAdminSave>;
}) {
  const [mins, setMins] = useState(String(row.targetMins));
  const [text, setText] = useState(row.targetText);
  const dirty = Number(mins) !== row.targetMins || text.trim() !== row.targetText;
  return (
    <tr className="border-t border-line-soft align-middle">
      <td className={`${td} num font-semibold text-ink`}>{row.id}</td>
      <td className={`${td} text-ink`}>{row.touchpoint}</td>
      <td className={`${td} text-ink-2`}>{row.owner}</td>
      <td className={td}>
        <Chip dot tone={row.ownerType === 'external' ? 'neutral' : 'blue'}>
          {row.ownerType === 'external' ? 'External' : 'Internal'}
        </Chip>
      </td>
      {row.derived ? (
        <td className={`${td} text-ink-2`} colSpan={3}>
          {row.targetText} ·{' '}
          <span className="text-ink-3">
            {row.id === 'SLA-06' ? 'set on the Quote Collection Matrix' : 'set on the follow-up ladder'}
          </span>
        </td>
      ) : (
        <>
          <td className={td}>
            <input className={`${input} w-56`} value={text} onChange={(e) => setText(e.target.value)} />
          </td>
          <td className={td}>
            <input
              className={`${input} num w-24`}
              type="number"
              min={1}
              value={mins}
              onChange={(e) => setMins(e.target.value)}
            />
          </td>
          <td className={`${td} text-right`}>
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty || save.isPending}
              onClick={() =>
                save.mutate({
                  path: `/sla/${row.id}`,
                  method: 'PATCH',
                  // a changed target with unchanged text gets fresh text from the server
                  json: {
                    targetMins: Number(mins),
                    targetText: text.trim() !== row.targetText ? text.trim() : undefined,
                  },
                })
              }
            >
              Save
            </Button>
          </td>
        </>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------- SLA-06 matrix (PRD 8.3)

const SCENARIOS: Array<{ key: QuoteTargetScenario; label: string }> = [
  { key: QuoteTargetScenario.PREFERRED, label: 'Preferred' },
  { key: QuoteTargetScenario.NON_PREFERRED, label: 'Non-preferred' },
  { key: QuoteTargetScenario.RENEWAL, label: 'Renewal' },
];

export function MatrixSection({ view }: { view: AdminMastersView }) {
  const save = useAdminSave();
  const cell = (lob: TimingLob, sc: QuoteTargetScenario) =>
    view.matrix.find((c) => c.timingLob === lob && c.scenario === sc)?.businessDays;
  return (
    <>
      <p className="mb-3 text-dense text-ink-2">
        Business days to collect quotes (SLA-06). New business uses the risk tier column, Renewal the Renewal
        column; Rollover uses Non-preferred for EB and Preferred for the rest. Half days allowed; saves when
        you leave the cell.
      </p>
      <Table head={['Timing LOB', ...SCENARIOS.map((s) => s.label)]}>
        {Object.values(TimingLob).map((lob) => (
          <tr key={lob} className="border-t border-line-soft">
            <td className={`${td} font-semibold text-ink`}>{lob}</td>
            {SCENARIOS.map((s) => (
              <td key={s.key} className={td}>
                <input
                  key={`${lob}-${s.key}-${cell(lob, s.key)}`}
                  className={`${input} num w-20`}
                  type="number"
                  step={0.5}
                  min={0.5}
                  defaultValue={cell(lob, s.key)}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v && v !== cell(lob, s.key))
                      save.mutate({
                        path: '/quote-targets',
                        method: 'PUT',
                        json: { timingLob: lob, scenario: s.key, businessDays: v },
                      });
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </Table>
      <SaveError error={save.error} />
    </>
  );
}

// ---------------------------------------------------------------- Business calendar + holidays (PRD 8.1)

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarSection({ view }: { view: AdminMastersView }) {
  const hours = useAdminSave();
  const hol = useAdminSave();
  const [cal, setCal] = useState(view.calendar);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const dirty = JSON.stringify(cal) !== JSON.stringify(view.calendar);
  const toggle = (d: number) =>
    setCal((c) => ({
      ...c,
      workdays: c.workdays.includes(d) ? c.workdays.filter((x) => x !== d) : [...c.workdays, d].sort(),
    }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="Working Days and Hours">
        <label className={label}>Working days</label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <button
              key={d}
              onClick={() => toggle(i + 1)}
              className={clsx(
                'rounded-full border-[0.5px] px-3 py-1.5 text-dense font-medium',
                cal.workdays.includes(i + 1)
                  ? 'border-brand bg-brand text-white'
                  : 'border-line text-ink-2 hover:border-brand',
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div>
            <label className={label}>Day starts</label>
            <input
              className={`${input} w-full`}
              type="time"
              value={cal.dayStart}
              onChange={(e) => setCal({ ...cal, dayStart: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Day ends</label>
            <input
              className={`${input} w-full`}
              type="time"
              value={cal.dayEnd}
              onChange={(e) => setCal({ ...cal, dayEnd: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Time zone</label>
            <input
              className={`${input} w-full`}
              value={cal.timezone}
              onChange={(e) => setCal({ ...cal, timezone: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-meta text-ink-2">
            1 business day = <span className="num">{view.calendar.minutesPerDay}</span> business minutes
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || hours.isPending}
            onClick={() =>
              hours.mutate({
                path: '/settings/business_calendar',
                method: 'PUT',
                json: {
                  timezone: cal.timezone,
                  workdays: cal.workdays,
                  dayStart: cal.dayStart,
                  dayEnd: cal.dayEnd,
                },
              })
            }
          >
            Save Hours
          </Button>
        </div>
        <SaveError error={hours.error} />
      </SectionCard>

      <SectionCard
        title="Holidays"
        badge={<Chip size="xs">{view.holidays.filter((h) => h.active).length} active</Chip>}
      >
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className={label}>Date</label>
            <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="min-w-0 flex-1">
            <label className={label}>Name</label>
            <input
              className={`${input} w-full`}
              value={name}
              placeholder="e.g. Republic Day"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={12} />}
            disabled={!date || !name.trim() || hol.isPending}
            onClick={() =>
              hol.mutate(
                { path: '/holidays', method: 'POST', json: { date, name: name.trim() } },
                {
                  onSuccess: () => {
                    setDate('');
                    setName('');
                  },
                },
              )
            }
          >
            Add Holiday
          </Button>
        </div>
        <SaveError error={hol.error} />
        {!view.holidays.length && (
          <div className="text-dense text-ink-2">
            No holidays yet. The list is pending from the Placement Head (PRD App. A #20).
          </div>
        )}
        <ul className="divide-y divide-line-soft">
          {view.holidays.map((h) => (
            <li key={h.date} className={clsx('flex items-center gap-3 py-2', !h.active && 'opacity-50')}>
              <span className="num w-24 font-mono text-meta text-ink">{h.date}</span>
              <span className="flex-1 text-dense text-ink">{h.name}</span>
              {!h.active && <Chip size="xs">Retired</Chip>}
              <Button
                size="sm"
                variant="ghost"
                icon={h.active ? <Trash2 size={12} /> : <RotateCcw size={12} />}
                onClick={() =>
                  hol.mutate({ path: `/holidays/${h.date}`, method: 'PATCH', json: { active: !h.active } })
                }
              >
                {h.active ? 'Retire' : 'Restore'}
              </Button>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------- Thresholds, SLA-P1, follow-up ladder

function NumberField({
  name,
  value,
  onChange,
  step = 1,
  hint,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className={label}>{name}</label>
      <input
        className={`${input} num w-full`}
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="mt-1 text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function EscalationSection({ view }: { view: AdminMastersView }) {
  const t = useAdminSave();
  const p1 = useAdminSave();
  const lad = useAdminSave();
  const [thr, setThr] = useState(view.thresholds);
  const [sla, setSla] = useState(view.slaP1);
  const [ladder, setLadder] = useState(view.followUpLadder);
  const insurerTemplates = view.templates.filter((x) => x.audience === 'insurer' && x.active);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const setStep = (i: number, patch: Partial<(typeof ladder)[number]>) =>
    setLadder((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="Thresholds">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name="Usable quote threshold"
            value={thr.usableQuoteThreshold}
            onChange={(v) => setThr({ ...thr, usableQuoteThreshold: v })}
            hint="Distinct insurers; reaching it stops follow-ups and drafts the QCR"
          />
          <NumberField
            name="Due Today window (business minutes)"
            value={thr.dueSoonBusinessMins}
            onChange={(v) => setThr({ ...thr, dueSoonBusinessMins: v })}
          />
          <NumberField
            name="SLA Risk window (business minutes)"
            value={thr.slaRiskBusinessMins}
            onChange={(v) => setThr({ ...thr, slaRiskBusinessMins: v })}
          />
          <NumberField
            name="At-risk share of the target"
            step={0.05}
            value={thr.atRiskFraction}
            onChange={(v) => setThr({ ...thr, atRiskFraction: v })}
          />
        </div>
        <div className="mt-3 text-right">
          <Button
            size="sm"
            variant="primary"
            disabled={same(thr, view.thresholds) || t.isPending}
            onClick={() => t.mutate({ path: '/settings/thresholds', method: 'PUT', json: thr })}
          >
            Save Thresholds
          </Button>
        </div>
        <SaveError error={t.error} />
      </SectionCard>

      <SectionCard title="SLA-P1 Internal Escalation">
        <p className="mb-3 text-dense text-ink-2">
          On an internal breach the owner gets reminders; after the last interval the ticket moves to the
          Placement Head.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name="Reminder interval (business minutes)"
            value={sla.reminderIntervalMins}
            onChange={(v) => setSla({ ...sla, reminderIntervalMins: v })}
          />
          <NumberField
            name="Reminders before escalation"
            value={sla.remindersBeforeEscalation}
            onChange={(v) => setSla({ ...sla, remindersBeforeEscalation: v })}
          />
        </div>
        <div className="mt-3 text-right">
          <Button
            size="sm"
            variant="primary"
            disabled={same(sla, view.slaP1) || p1.isPending}
            onClick={() => p1.mutate({ path: '/settings/sla_p1', method: 'PUT', json: sla })}
          >
            Save SLA-P1
          </Button>
        </div>
        <SaveError error={p1.error} />
      </SectionCard>

      <div className="lg:col-span-2">
        <SectionCard title="Insurer Follow-up Ladder">
          <p className="mb-3 text-dense text-ink-2">
            Sent to every POC on the thread, counted in business days after the float. Stops on a decline, a
            usable or excluded quote, or when the ticket reaches the threshold.
          </p>
          <div className="space-y-2">
            {ladder.map((s, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <span className="num w-6 pb-2 text-meta font-semibold text-ink-2">{i + 1}</span>
                <div>
                  <label className={label}>After (business days)</label>
                  <input
                    className={`${input} num w-28`}
                    type="number"
                    step={0.5}
                    value={s.afterBusinessDays}
                    onChange={(e) => setStep(i, { afterBusinessDays: Number(e.target.value) })}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className={label}>Label</label>
                  <input
                    className={`${input} w-full`}
                    value={s.label}
                    onChange={(e) => setStep(i, { label: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label}>Template</label>
                  <select
                    className={input}
                    value={s.templateId}
                    onChange={(e) => setStep(i, { templateId: e.target.value })}
                  >
                    {insurerTemplates.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.id} · {x.trigger}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={12} />}
                  disabled={ladder.length === 1}
                  onClick={() => setLadder((l) => l.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between">
            <Button
              size="sm"
              icon={<Plus size={12} />}
              disabled={ladder.length >= 5}
              onClick={() =>
                setLadder((l) => [
                  ...l,
                  {
                    step: l.length + 1,
                    afterBusinessDays: (l[l.length - 1]?.afterBusinessDays ?? 0) + 1,
                    label: `Follow-up ${l.length + 1}`,
                    templateId: insurerTemplates[0]?.id ?? '',
                  },
                ])
              }
            >
              Add Step
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={same(ladder, view.followUpLadder) || lad.isPending}
              onClick={() => lad.mutate({ path: '/settings/follow_up_ladder', method: 'PUT', json: ladder })}
            >
              Save Ladder
            </Button>
          </div>
          <SaveError error={lad.error} />
        </SectionCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Reason lists + industries (FR-142, FR-146)

const KIND_LABEL: Record<EditableLookupKind, string> = {
  industry_type: 'Industry Types',
  early_release_reason: 'Early Release Reasons',
  mandate_request_reason: 'Mandate Request Reasons',
  mandate_decline_reason: 'Mandate Decline Reasons',
  closure_reason: 'Closure Reasons',
  rejection_reason: 'Rejection Reasons',
  exclusion_reason: 'Exclusion Reasons',
};

export function ListsSection({ view }: { view: AdminMastersView }) {
  const save = useAdminSave();
  const [kind, setKind] = useState<EditableLookupKind>('early_release_reason');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const rows = view.lookups.filter((l) => l.kind === kind);
  return (
    <>
      <FilterPills
        value={kind}
        onChange={setKind}
        items={EDITABLE_LOOKUP_KINDS.map((k) => ({
          key: k,
          label: KIND_LABEL[k],
          count: view.lookups.filter((l) => l.kind === k && l.active).length,
        }))}
      />
      <p className="mb-3 mt-4 text-dense text-ink-2">
        Values are never renamed or deleted: tickets keep the text they were saved with. Retire a value and
        add the new wording instead.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <label className={label}>New value</label>
          <input className={`${input} w-full`} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="min-w-[240px] flex-1">
          <label className={label}>Description (optional)</label>
          <input
            className={`${input} w-full`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus size={12} />}
          disabled={!value.trim() || save.isPending}
          onClick={() =>
            save.mutate(
              { path: `/lookups/${kind}`, method: 'POST', json: { value: value.trim(), description } },
              {
                onSuccess: () => {
                  setValue('');
                  setDescription('');
                },
              },
            )
          }
        >
          Add Value
        </Button>
      </div>
      <SaveError error={save.error} />
      <Table head={['Value', 'Description', 'Status', '']}>
        {!rows.length && (
          <tr>
            <td className={`${td} text-ink-2`} colSpan={4}>
              No values yet. The list is pending from the Placement Head.
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.id} className={clsx('border-t border-line-soft', !r.active && 'opacity-50')}>
            <td className={`${td} font-semibold text-ink`}>{r.value}</td>
            <td className={`${td} text-ink-2`}>{r.description || '-'}</td>
            <td className={td}>
              <Chip dot tone={r.active ? 'green' : 'neutral'}>
                {r.active ? 'Active' : 'Retired'}
              </Chip>
            </td>
            <td className={`${td} text-right`}>
              <Button
                size="sm"
                variant="ghost"
                icon={r.active ? <Trash2 size={12} /> : <RotateCcw size={12} />}
                onClick={() =>
                  save.mutate({
                    path: `/lookup-values/${r.id}`,
                    method: 'PATCH',
                    json: { active: !r.active },
                  })
                }
              >
                {r.active ? 'Retire' : 'Restore'}
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ---------------------------------------------------------------- Communication templates (FR-140)

const AUDIENCE_LABEL = { insurer: 'Insurer', rm: 'RM', internal: 'Internal' } as const;
const placeholdersOf = (s: string) => [...new Set([...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];

export function TemplatesSection({ view }: { view: AdminMastersView }) {
  const [id, setId] = useState(view.templates[0]?.id ?? '');
  const tpl = view.templates.find((t) => t.id === id);
  const known = placeholdersOf(view.templates.map((t) => `${t.subjectTemplate} ${t.bodyTemplate}`).join(' '));
  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <ul className="space-y-1">
        {view.templates.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => setId(t.id)}
              className={clsx(
                'w-full rounded-lg px-3 py-2 text-left',
                t.id === id ? 'bg-[rgba(65,0,207,0.08)] text-brand' : 'text-ink hover:bg-card-alt',
              )}
            >
              <div className="num text-meta font-semibold">
                {t.id} · {AUDIENCE_LABEL[t.audience]}
              </div>
              <div className="truncate text-dense">{t.trigger}</div>
            </button>
          </li>
        ))}
      </ul>
      {tpl && <TemplateEditor key={tpl.id} tpl={tpl} known={known} />}
    </div>
  );
}

function TemplateEditor({ tpl, known }: { tpl: AdminMastersView['templates'][number]; known: string[] }) {
  const save = useAdminSave();
  const [subject, setSubject] = useState(tpl.subjectTemplate);
  const [body, setBody] = useState(tpl.bodyTemplate);
  const dirty = subject !== tpl.subjectTemplate || body !== tpl.bodyTemplate;
  return (
    <SectionCard
      title={`${tpl.id} · ${tpl.trigger}`}
      badge={<Chip size="xs">{AUDIENCE_LABEL[tpl.audience]}</Chip>}
    >
      <label className={label}>Subject</label>
      <input
        className={`${input} mb-3 w-full`}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <label className={label}>Body</label>
      <textarea
        className={`${input} min-h-[160px] w-full`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {known.map((p) => (
          <Chip key={p} size="xs">{`{{${p}}}`}</Chip>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-ink-3">
        Placeholders the templates already use. Insurer subjects must keep {'{{TicketID}}'} so replies map to
        the ticket.
      </div>
      <div className="mt-3 text-right">
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate({
              path: `/templates/${tpl.id}`,
              method: 'PATCH',
              json: { subjectTemplate: subject, bodyTemplate: body },
            })
          }
        >
          Save Template
        </Button>
      </div>
      <SaveError error={save.error} />
    </SectionCard>
  );
}

// ---------------------------------------------------------------- Product types (FR-142, FR-230)

export function ProductTypesSection({ view }: { view: AdminMastersView }) {
  const save = useAdminSave();
  return (
    <>
      <p className="mb-3 text-dense text-ink-2">
        Aliases are the names the mail bot matches; BimaSetu codes map a floated line to the product. Both
        must be unique across products. Separate values with commas.
      </p>
      <Table
        head={['Product', 'Group', 'Timing LOB', 'RFQ Template', 'Aliases', 'BimaSetu Codes', 'Status', '']}
      >
        {view.productTypes.map((p) => (
          <ProductRow key={p.code} p={p} save={save} />
        ))}
      </Table>
      <SaveError error={save.error} />
    </>
  );
}

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function ProductRow({
  p,
  save,
}: {
  p: AdminMastersView['productTypes'][number];
  save: ReturnType<typeof useAdminSave>;
}) {
  const [lob, setLob] = useState(p.timingLob);
  const [rfq, setRfq] = useState(p.rfqTemplate);
  const [aliases, setAliases] = useState(p.aliases.join(', '));
  const [codes, setCodes] = useState(p.bimasetuCodes.join(', '));
  const [active, setActive] = useState(p.active);
  const dirty =
    lob !== p.timingLob ||
    rfq !== p.rfqTemplate ||
    splitList(aliases).join('|') !== p.aliases.join('|') ||
    splitList(codes).join('|') !== p.bimasetuCodes.join('|') ||
    active !== p.active;
  return (
    <tr className={clsx('border-t border-line-soft align-top', !active && 'opacity-60')}>
      <td className={td}>
        <div className="font-semibold text-ink">{p.label}</div>
        <div className="num text-[11px] text-ink-3">{p.code}</div>
      </td>
      <td className={`${td} text-ink-2`}>{p.group}</td>
      <td className={td}>
        <select className={input} value={lob} onChange={(e) => setLob(e.target.value as TimingLob)}>
          {Object.values(TimingLob).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <input className={`${input} w-48`} value={rfq} onChange={(e) => setRfq(e.target.value)} />
      </td>
      <td className={td}>
        <input className={`${input} w-56`} value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </td>
      <td className={td}>
        <input
          className={`${input} w-32`}
          value={codes}
          placeholder="Pending"
          onChange={(e) => setCodes(e.target.value)}
        />
      </td>
      <td className={td}>
        <button onClick={() => setActive((a) => !a)}>
          <Chip dot tone={active ? 'green' : 'neutral'}>
            {active ? 'Active' : 'Retired'}
          </Chip>
        </button>
      </td>
      <td className={`${td} text-right`}>
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate({
              path: `/product-types/${p.code}`,
              method: 'PATCH',
              json: {
                timingLob: lob,
                rfqTemplate: rfq,
                aliases: splitList(aliases),
                bimasetuCodes: splitList(codes),
                active,
              },
            })
          }
        >
          Save
        </Button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- Mailboxes (read-only)

/** Which placement users can send through the connected mailbox provider (M5). Gmail is connected in the email layer, not here. */
export function MailboxesSection({ view }: { view: AdminMastersView }) {
  const rows = view.mailboxes ?? [];
  return (
    <SectionCard title="Mailboxes">
      <p className="mb-3 text-dense text-ink-2">
        Insurer and RM mail goes out only from the assigned Placement Manager's own mailbox.
      </p>
      {rows.length === 0 ? (
        <div className="text-dense text-ink-2">No Placement Managers or Placement Heads found.</div>
      ) : (
        <Table head={['Placement User', 'Mailbox', 'Status']}>
          {rows.map((r) => (
            <tr key={r.email} className="border-t-[0.5px] border-line">
              <td className={td}>{r.userName}</td>
              <td className={td}>{r.mailbox}</td>
              <td className={td}>
                <Chip
                  tone={r.status === 'connected' ? 'green' : r.status === 'unknown' ? 'neutral' : 'amber'}
                >
                  {r.status === 'connected'
                    ? 'Connected'
                    : r.status === 'unknown'
                      ? 'Status Unknown'
                      : 'Not Connected for Sending'}
                </Chip>
                {r.detail && r.status !== 'connected' && (
                  <span className="ml-2 text-meta text-ink-2">{r.detail}</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </SectionCard>
  );
}
