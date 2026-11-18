import { useMutation, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BUSINESS_TYPE_SEED,
  BusinessType,
  DocumentKind,
  INDUSTRY_TYPES_SEED,
  PRODUCT_TYPES_SEED,
  RFQ_UPLOAD_ACCEPT_DEFAULT,
  Urgency,
  type DirectoryView,
  type InsurerMasterRow,
} from '@bimaplacement/contracts';
import { useMe } from '@/api/hooks';
import { Button, Callout, Modal } from '@/design-system/components';
import { api, ApiRequestError, uploadDocument } from '@/lib/api-client';

type Form = {
  rfqLinkUrl: string;
  businessName: string;
  industryType: string;
  productType: string;
  businessType: BusinessType | '';
  renewalDate: string;
  incumbentInsurer: string;
  rmUserId: string;
  clientSpoc: string;
  urgency: Urgency;
  targetPremium: string;
  ownerId: string;
};

/**
 * Manual ticket (M1 3.3, FR-192..201, UI-SPEC 4 PlCreateCaseModal). RFQ Excel and/or link (at least one);
 * nothing is read from the RFQ. RM and owner pickers come from GET /directory; owner is Head-only (FR-198).
 * TODO(W11): masters from /masters/bootstrap once the Upload Rule / product masters are editable.
 */
export function CreateTicketModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { me, isHead } = useMe();
  const { data: dir } = useQuery({
    queryKey: ['directory'],
    queryFn: () => api<DirectoryView>('/directory'),
    staleTime: 5 * 60_000,
  });
  const { data: insurers = [] } = useQuery({
    queryKey: ['insurers', 'master'],
    queryFn: () => api<InsurerMasterRow[]>('/insurers/master'),
    staleTime: 5 * 60_000,
  });
  const insurerNames = [...new Set(insurers.map((i) => i.name))].sort();

  const [f, setF] = useState<Form>({
    rfqLinkUrl: '',
    businessName: '',
    industryType: '',
    productType: '',
    businessType: '',
    renewalDate: '',
    incumbentInsurer: '',
    rmUserId: '',
    clientSpoc: '',
    urgency: Urgency.MEDIUM,
    targetPremium: '',
    ownerId: '',
  });
  const [excel, setExcel] = useState<File | null>(null);
  // one key per opened form: a double click or a retried request creates one ticket (PRD 10.2)
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const linkBad = !!f.rfqLinkUrl && !/^https?:\/\//.test(f.rfqLinkUrl);
  const missing = [
    !excel && !f.rfqLinkUrl && 'RFQ Excel or link',
    linkBad && 'a link starting with http',
    !f.businessName.trim() && 'Business name',
    !f.industryType && 'Industry type',
    !f.productType && 'Product type',
    !f.businessType && 'Business type',
    f.businessType === BusinessType.RENEWAL && !f.renewalDate && 'Renewal date',
    !f.rmUserId && 'Relationship Manager',
  ].filter(Boolean) as string[];
  const product = PRODUCT_TYPES_SEED.find((p) => p.code === f.productType);
  const hasIncumbent = f.businessType === BusinessType.RENEWAL || f.businessType === BusinessType.ROLLOVER;

  const create = useMutation({
    mutationFn: async () => {
      const rfqExcelDocumentId = excel ? (await uploadDocument(excel, DocumentKind.RFQ_EXCEL)).id : undefined;
      return api<{ ticketNo: string }>('/tickets', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        json: {
          rfqExcelDocumentId,
          rfqLinkUrl: f.rfqLinkUrl || undefined,
          businessName: f.businessName.trim(),
          industryType: f.industryType,
          productType: f.productType,
          businessType: f.businessType,
          renewalDate: f.businessType === BusinessType.RENEWAL ? f.renewalDate : undefined,
          incumbentInsurer: hasIncumbent && f.incumbentInsurer.trim() ? f.incumbentInsurer.trim() : undefined,
          rmUserId: f.rmUserId,
          clientSpoc: f.clientSpoc.trim() || undefined,
          urgency: f.urgency,
          targetPremium: f.targetPremium ? Number(f.targetPremium.replace(/,/g, '')) : undefined,
          ownerId: isHead && f.ownerId ? f.ownerId : undefined,
        },
      });
    },
    onSuccess: (t) => {
      onClose();
      nav(`/tickets/${t.ticketNo}/rfq`);
    },
  });

  const input =
    'focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2 text-dense font-normal text-ink';
  return (
    <Modal
      title="Create ticket"
      subtitle="Manual ticket · one product per ticket"
      size="lg"
      onClose={onClose}
      footer={
        <>
          {missing.length > 0 && (
            <span className="mr-auto self-center text-meta text-ink-2">Missing: {missing.join(', ')}</span>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={missing.length > 0 || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create ticket'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Callout>Nothing is read from the RFQ - intake values are what you type here (FR-199).</Callout>
        <div className="grid grid-cols-2 gap-4">
          <Field label="RFQ Excel" group>
            <ExcelDrop file={excel} onFile={setExcel} />
          </Field>
          <Field label="RFQ link" hint={linkBad ? 'Must start with http:// or https://' : undefined}>
            <input
              className={input}
              placeholder="https://..."
              value={f.rfqLinkUrl}
              onChange={set('rfqLinkUrl')}
            />
          </Field>
          <Field label="Business name">
            <input className={input} value={f.businessName} onChange={set('businessName')} />
          </Field>
          <Field label="Industry type">
            <select className={input} value={f.industryType} onChange={set('industryType')}>
              <option value="" />
              {INDUSTRY_TYPES_SEED.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </Field>
          <Field label="Product type" hint={product ? `RFQ template: ${product.rfqTemplate}` : undefined}>
            <select className={input} value={f.productType} onChange={set('productType')}>
              <option value="" />
              {PRODUCT_TYPES_SEED.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.group} · {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Business type">
            <select className={input} value={f.businessType} onChange={set('businessType')}>
              <option value="" />
              {BUSINESS_TYPE_SEED.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.value} - {b.meaning}
                </option>
              ))}
            </select>
          </Field>
          {f.businessType === BusinessType.RENEWAL && (
            <Field label="Renewal date">
              <input type="date" className={input} value={f.renewalDate} onChange={set('renewalDate')} />
            </Field>
          )}
          {hasIncumbent && (
            <Field label="Incumbent insurer (optional)">
              <input
                className={input}
                list="incumbent-insurers"
                value={f.incumbentInsurer}
                onChange={set('incumbentInsurer')}
              />
              <datalist id="incumbent-insurers">
                {insurerNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
          )}
          <Field label="Relationship Manager">
            <select className={input} value={f.rmUserId} onChange={set('rmUserId')}>
              <option value="" />
              {dir?.rms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Client SPOC (optional)">
            <input className={input} value={f.clientSpoc} onChange={set('clientSpoc')} />
          </Field>
          <Field label="Target premium (optional, INR)">
            <input
              className={input}
              inputMode="numeric"
              value={f.targetPremium}
              onChange={(e) => setF({ ...f, targetPremium: e.target.value.replace(/[^\d,]/g, '') })}
            />
          </Field>
          {isHead && (
            <Field label="Owner">
              <select className={input} value={f.ownerId} onChange={set('ownerId')}>
                <option value="">{me?.name ?? 'Me'} (you)</option>
                {dir?.owners
                  .filter((o) => o.id !== me?.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {o.role}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Urgency" group>
            <div className="mt-1 flex gap-1.5">
              {[Urgency.HIGH, Urgency.MEDIUM, Urgency.LOW].map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={f.urgency === u}
                  onClick={() => setF({ ...f, urgency: u })}
                  className={`rounded-lg border px-3 py-2 text-dense font-medium ${f.urgency === u ? 'border-brand bg-brand-50 text-brand' : 'border-line text-ink-2 hover:border-brand'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </Field>
        </div>
        {create.error && (
          <Callout tone="red">
            {create.error instanceof ApiRequestError
              ? create.error.message
              : 'Could not create the ticket. Try again.'}
          </Callout>
        )}
      </div>
    </Modal>
  );
}

/** `group` for controls that hold buttons, so clicking the caption does not press the first button. */
function Field({
  label,
  hint,
  group,
  children,
}: {
  label: string;
  hint?: string;
  group?: boolean;
  children: ReactNode;
}) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag
      className="block text-xs font-semibold text-ink-2"
      role={group ? 'group' : undefined}
      aria-label={group ? label : undefined}
    >
      {label}
      {children}
      {hint && <span className="mt-1 block font-medium text-placement">{hint}</span>}
    </Tag>
  );
}

/** PlRfqUploadField: drop or pick one RFQ Excel (.xlsx/.xls/.csv per the Upload Rule default, no size limit). */
function ExcelDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [bad, setBad] = useState(false);
  const accept = (f: File | undefined) => {
    if (!f) return;
    const ok = RFQ_UPLOAD_ACCEPT_DEFAULT.some((ext) => f.name.toLowerCase().endsWith(ext));
    setBad(!ok);
    if (ok) onFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    accept(e.dataTransfer.files[0]);
  };
  if (file)
    return (
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-card-alt px-3 py-2 text-dense font-medium text-ink">
        <FileSpreadsheet size={15} className="shrink-0 text-t-green" />
        <span className="truncate">{file.name}</span>
        <button
          type="button"
          onClick={() => onFile(null)}
          aria-label="Remove RFQ Excel"
          className="ml-auto rounded p-0.5 text-ink-3 hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    );
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-dense font-normal ${over ? 'border-brand bg-brand-50 text-brand' : 'border-line text-ink-2 hover:border-brand'}`}
      >
        <Upload size={14} /> Drop the RFQ Excel or browse
        <input
          ref={ref}
          type="file"
          hidden
          accept={RFQ_UPLOAD_ACCEPT_DEFAULT.join(',')}
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>
      {bad && (
        <span className="mt-1 block font-medium text-t-red">Use {RFQ_UPLOAD_ACCEPT_DEFAULT.join(', ')}</span>
      )}
    </>
  );
}
