import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { DataSource, type EntityManager, Not } from 'typeorm';
import {
  BUSINESS_CALENDAR_DEFAULTS,
  DERIVED_SLA_IDS,
  EDITABLE_LOOKUP_KINDS,
  type AdminMastersView,
  type EditableLookupKind,
  type MailboxStatusView,
  type MasterChangeView,
  type SlaId,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import type { AppConfig } from '../../config/configuration';
import { MAILBOX, type MailboxConnector } from '../../infrastructure/mail/mailbox.port';
import { User } from '../users/user.entity';
import { SlaConfigService } from '../sla/sla-config.service';
import {
  AppSetting,
  Holiday,
  LookupValue,
  ProductType,
  QuoteTarget,
  SlaDefinition,
  CommunicationTemplate,
  type LookupKind,
} from './entities';
import { changeViews, recordChange } from './change-log';
import { isEditableSetting, placeholders, slaTargetText, validateSetting } from './settings-validation';
import type {
  HolidayDto,
  HolidayPatchDto,
  LookupDto,
  LookupPatchDto,
  ProductTypePatchDto,
  QuoteTargetDto,
  SlaTargetDto,
  TemplatePatchDto,
} from './dto/admin.dto';

const SETTING_LABELS: Record<string, string> = {
  business_calendar: 'Business calendar',
  thresholds: 'Thresholds',
  sla_p1: 'SLA-P1 escalation',
  follow_up_ladder: 'Follow-up ladder',
  upload_rules: 'Upload rules',
};

/** Admin master entity types (the Insurer Master keeps its own log screen). */
const ADMIN_CHANGE_TYPES = [
  'sla_definition',
  'quote_target',
  'app_setting',
  'holiday',
  'lookup_value',
  'communication_template',
  'product_type',
];

/**
 * Read API for dropdowns + Admin edits (FR-139..148, FR-270, PLAN 4.2). Every edit writes before/after rows to
 * master_change_log in the same transaction (FR-148) and reloads the SLA config cache, so it applies to clocks
 * started after the save (BR-091). Values are retired, never deleted.
 */
@Injectable()
export class MastersService {
  constructor(
    private readonly ds: DataSource,
    private readonly sla: SlaConfigService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(MAILBOX) private readonly mailbox: MailboxConnector,
  ) {}

  productTypes() {
    return this.ds.getRepository(ProductType).find({ where: { active: true }, order: { sortOrder: 'ASC' } });
  }

  lookups(kind: LookupKind) {
    return this.ds
      .getRepository(LookupValue)
      .find({ where: { kind, active: true }, order: { sortOrder: 'ASC' } });
  }

  /** Everything the web app needs at boot in one call (cache with ETag). */
  async bootstrap() {
    const [productTypes, lookups, sla, matrix, holidays, settings] = await Promise.all([
      this.productTypes(),
      this.ds.getRepository(LookupValue).find({ where: { active: true } }),
      this.ds.getRepository(SlaDefinition).find(),
      this.ds.getRepository(QuoteTarget).find(),
      this.ds.getRepository(Holiday).find({ where: { active: true } }),
      this.ds.getRepository(AppSetting).find(),
    ]);
    return { productTypes, lookups, sla, matrix, holidays, settings };
  }

  templates() {
    return this.ds.getRepository(CommunicationTemplate).find();
  }

  /**
   * GET /masters/admin: the Admin screens' data, retired values included. Settings as currently in force.
   * Mailbox status asks the mail provider, so it is left out of save responses (`withMailboxes: false`).
   */
  async admin({ withMailboxes = true } = {}): Promise<AdminMastersView> {
    const [sla, matrix, holidays, lookups, templates, products, settings, mailboxes] = await Promise.all([
      this.ds.getRepository(SlaDefinition).find({ where: { active: true }, order: { id: 'ASC' } }),
      this.ds.getRepository(QuoteTarget).find(),
      this.ds.getRepository(Holiday).find({ order: { date: 'ASC' } }),
      this.ds.getRepository(LookupValue).find({ order: { kind: 'ASC', sortOrder: 'ASC', value: 'ASC' } }),
      this.ds.getRepository(CommunicationTemplate).find({ order: { id: 'ASC' } }),
      this.ds.getRepository(ProductType).find({ order: { sortOrder: 'ASC' } }),
      this.ds.getRepository(AppSetting).find(),
      withMailboxes ? this.mailboxStatuses() : undefined,
    ]);
    const setting = (key: string) => settings.find((s) => s.key === key)?.value;
    const cal = { ...BUSINESS_CALENDAR_DEFAULTS, ...((setting('business_calendar') as object) ?? {}) };
    return {
      ...(mailboxes !== undefined ? { mailboxes: mailboxes as MailboxStatusView[] | null } : {}),
      sla: sla.map((d) => ({
        id: d.id,
        touchpoint: d.touchpoint,
        owner: d.owner,
        ownerType: d.ownerType,
        targetMins: d.targetMins,
        targetText: d.targetText,
        derived: DERIVED_SLA_IDS.includes(d.id),
      })),
      matrix: matrix.map((c) => ({
        timingLob: c.timingLob,
        scenario: c.scenario,
        businessDays: c.businessDays,
      })),
      calendar: { ...cal, workdays: [...cal.workdays], minutesPerDay: this.sla.calendar.minutesPerDay },
      holidays: holidays.map((h) => ({ date: h.date, name: h.name, active: h.active })),
      thresholds: { ...this.sla.thresholds },
      slaP1: { ...this.sla.slaP1 },
      followUpLadder: this.sla.followUpLadder.map((s) => ({ ...s })),
      uploadRules: (setting('upload_rules') as AdminMastersView['uploadRules']) ?? {
        rfqAccept: ['.xlsx', '.xls', '.csv'],
        qcrAccept: null,
      },
      lookups: lookups
        .filter((l) => (EDITABLE_LOOKUP_KINDS as readonly string[]).includes(l.kind))
        .map((l) => ({
          id: l.id,
          kind: l.kind as EditableLookupKind,
          value: l.value,
          description: l.description,
          active: l.active,
          sortOrder: l.sortOrder,
        })),
      templates: templates.map((t) => ({
        id: t.id,
        audience: t.audience,
        trigger: t.trigger,
        subjectTemplate: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        active: t.active,
      })),
      productTypes: products.map((p) => ({
        code: p.code,
        label: p.label,
        group: p.group,
        timingLob: p.timingLob,
        rfqTemplate: p.rfqTemplate,
        aliases: p.aliases,
        bimasetuCodes: p.bimasetuCodes,
        active: p.active,
      })),
    };
  }

  /**
   * Read-only mailbox status per placement user (M5: mail only goes out from the assigned PM's own mailbox).
   * null on the dev driver. One health() call for everyone; if it fails or hangs, everyone shows `unknown`
   * and the view still loads.
   */
  private async mailboxStatuses(): Promise<MailboxStatusView[] | null> {
    if (this.config.get('mailbox', { infer: true }).driver === 'dev') return null;
    const users = await this.ds
      .getRepository(User)
      .createQueryBuilder('u')
      .where('u.roles && ARRAY[:...roles]::text[]', { roles: ['placement_manager', 'placement_head'] })
      .orderBy('u.name', 'ASC')
      .getMany();
    const rows = users.map((u) => ({
      userName: u.name,
      email: u.email,
      mailbox: u.mailboxAddress ?? u.email,
    }));
    try {
      const health = await Promise.race([
        this.mailbox.health(rows.map((r) => r.mailbox)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 6000).unref()),
      ]);
      return rows.map((r): MailboxStatusView => {
        const h = health[r.mailbox];
        if (!h) return { ...r, status: 'unknown', detail: 'no status from the mail provider' };
        return { ...r, status: h.ok ? 'connected' : 'not_connected', detail: h.detail ?? null };
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return rows.map((r): MailboxStatusView => ({ ...r, status: 'unknown', detail }));
    }
  }

  /** Admin change history (FR-148); the Insurer Master keeps its own log screen. */
  changeLog(limit = 100): Promise<MasterChangeView[]> {
    return changeViews(this.ds, { types: ADMIN_CHANGE_TYPES, limit });
  }

  /** SLA master target (FR-139). SLA-06 comes from the matrix and SLA-07..09 from the follow-up ladder. */
  updateSla(user: AuthUser, id: string, dto: SlaTargetDto) {
    if (DERIVED_SLA_IDS.includes(id as SlaId))
      throw DomainError.guard(
        id === 'SLA-06'
          ? 'SLA-06 targets are set on the quote collection matrix'
          : `${id} follows the insurer follow-up ladder; edit the ladder instead`,
      );
    return this.save(async (m) => {
      const d = await m.getRepository(SlaDefinition).findOneBy({ id: id as SlaId, active: true });
      if (!d) throw DomainError.notFound('SLA', id);
      const text = dto.targetText?.trim() || slaTargetText(dto.targetMins, this.sla.calendar.minutesPerDay);
      const label = `${d.id} ${d.touchpoint}`;
      await this.apply(m, user, 'sla_definition', d.id, label, d, {
        targetMins: dto.targetMins,
        targetText: text,
      });
      await m.getRepository(SlaDefinition).save(d);
    });
  }

  /** One SLA-06 matrix cell, in business days (PRD 8.3, Appendix C #14). */
  updateQuoteTarget(user: AuthUser, dto: QuoteTargetDto) {
    if (Math.round(dto.businessDays * 2) !== dto.businessDays * 2)
      throw DomainError.guard('Quote collection targets are set in half days');
    return this.save(async (m) => {
      const repo = m.getRepository(QuoteTarget);
      const cell = await repo.findOneBy({ timingLob: dto.timingLob, scenario: dto.scenario });
      if (!cell) throw DomainError.notFound('Matrix cell', `${dto.timingLob} / ${dto.scenario}`);
      const label = `SLA-06 ${dto.timingLob} · ${dto.scenario}`;
      await this.apply(m, user, 'quote_target', `${dto.timingLob}:${dto.scenario}`, label, cell, {
        businessDays: dto.businessDays,
      });
      await repo.update(
        { timingLob: dto.timingLob, scenario: dto.scenario },
        { businessDays: dto.businessDays },
      );
    });
  }

  /** Calendar, thresholds, SLA-P1, follow-up ladder, upload rules (FR-139). Objects merge over what is stored. */
  updateSetting(user: AuthUser, key: string, value: unknown) {
    if (!isEditableSetting(key)) throw DomainError.guard(`"${key}" is not an editable setting`);
    return this.save(async (m) => {
      const repo = m.getRepository(AppSetting);
      const row = await repo.findOneBy({ key });
      const before = row?.value ?? this.current(key);
      const merged =
        before && typeof before === 'object' && !Array.isArray(before) && value && typeof value === 'object'
          ? { ...(before as object), ...(value as object) }
          : value;
      const insurerTemplateIds = (
        await m.getRepository(CommunicationTemplate).findBy({ audience: 'insurer', active: true })
      ).map((t) => t.id);
      const check = validateSetting(key, merged, { insurerTemplateIds });
      if (!check.ok) throw DomainError.guard(check.reason);
      if (JSON.stringify(before) === JSON.stringify(check.value)) return;
      await recordChange(m, user, {
        entityType: 'app_setting',
        entityId: key,
        entityLabel: SETTING_LABELS[key],
        field: key,
        before,
        after: check.value,
      });
      await repo.save({ key, value: check.value, updatedBy: user.id });
    });
  }

  /** Business calendar holiday (Appendix C #16). Re-adding a retired date brings it back. */
  addHoliday(user: AuthUser, dto: HolidayDto) {
    const date = this.isoDate(dto.date);
    const name = dto.name.trim();
    if (!name) throw DomainError.guard('A holiday needs a name');
    return this.save(async (m) => {
      const repo = m.getRepository(Holiday);
      const h = await repo.findOneBy({ date });
      if (h?.active) throw DomainError.guard(`${date} is already a holiday (${h.name})`);
      if (h) {
        await this.apply(m, user, 'holiday', date, `Holiday ${date}`, h, { name, active: true });
        await repo.save(h);
      } else {
        await repo.insert({ date, name, active: true });
        await recordChange(m, user, {
          entityType: 'holiday',
          entityId: date,
          entityLabel: `Holiday ${date}`,
          field: 'created',
          before: null,
          after: { name },
        });
      }
    });
  }

  updateHoliday(user: AuthUser, date: string, dto: HolidayPatchDto) {
    const d = this.isoDate(date);
    if (dto.name !== undefined && !dto.name.trim()) throw DomainError.guard('A holiday needs a name');
    return this.save(async (m) => {
      const h = await m.getRepository(Holiday).findOneBy({ date: d });
      if (!h) throw DomainError.notFound('Holiday', d);
      await this.apply(m, user, 'holiday', d, `Holiday ${d}`, h, {
        name: dto.name?.trim(),
        active: dto.active,
      });
      await m.getRepository(Holiday).save(h);
    });
  }

  /** New value on a reason list or the industry list (FR-142, FR-146). */
  addLookup(user: AuthUser, kind: string, dto: LookupDto) {
    const k = this.editableKind(kind);
    const value = dto.value.trim();
    if (!value) throw DomainError.guard('The value cannot be empty');
    return this.save(async (m) => {
      const repo = m.getRepository(LookupValue);
      const existing = await repo.findOneBy({ kind: k, value });
      if (existing)
        throw DomainError.guard(
          existing.active
            ? `"${value}" is already on the list`
            : `"${value}" is retired; reactivate it instead`,
        );
      const max = await repo.maximum('sortOrder', { kind: k });
      const row = await repo.save(
        repo.create({
          kind: k,
          value,
          description: dto.description?.trim() || null,
          sortOrder: (max ?? 0) + 1,
        }),
      );
      await recordChange(m, user, {
        entityType: 'lookup_value',
        entityId: row.id,
        entityLabel: `${k} · ${value}`,
        field: 'created',
        before: null,
        after: { value, description: row.description },
      });
    });
  }

  /** Values are never renamed (tickets keep the text they were saved with): retire and add a new one instead. */
  updateLookup(user: AuthUser, id: string, dto: LookupPatchDto) {
    return this.save(async (m) => {
      const repo = m.getRepository(LookupValue);
      const row = await repo.findOneBy({ id });
      if (!row || !(EDITABLE_LOOKUP_KINDS as readonly string[]).includes(row.kind))
        throw DomainError.notFound('List value', id);
      if (
        dto.active === false &&
        row.active &&
        !(await repo.existsBy({ kind: row.kind, active: true, id: Not(row.id) }))
      )
        throw DomainError.guard('Keep at least one active value on the list');
      await this.apply(m, user, 'lookup_value', row.id, `${row.kind} · ${row.value}`, row, {
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        active: dto.active,
        sortOrder: dto.sortOrder,
      });
      await repo.save(row);
    });
  }

  /**
   * Communication template wording (FR-140; final text pending from the Placement Head, PRD App. A #20).
   * Only placeholders the templates already use are accepted - an unknown one would render empty in a live mail.
   */
  updateTemplate(user: AuthUser, id: string, dto: TemplatePatchDto) {
    return this.save(async (m) => {
      const repo = m.getRepository(CommunicationTemplate);
      const all = await repo.find();
      const t = all.find((x) => x.id === id);
      if (!t) throw DomainError.notFound('Template', id);
      const subject = dto.subjectTemplate?.trim();
      const body = dto.bodyTemplate?.trim();
      if (subject === '' || body === '') throw DomainError.guard('Subject and body cannot be empty');
      const known = new Set(all.flatMap((x) => placeholders(`${x.subjectTemplate} ${x.bodyTemplate}`)));
      const unknown = placeholders(`${subject ?? ''} ${body ?? ''}`).filter((p) => !known.has(p));
      if (unknown.length)
        throw DomainError.guard(`Unknown placeholder ${unknown.map((p) => `{{${p}}}`).join(', ')}`);
      if (t.audience === 'insurer' && subject !== undefined && !/\{\{\s*TicketID\s*\}\}/.test(subject))
        throw DomainError.guard('Insurer mail subjects must keep {{TicketID}} for reply mapping (FR-050)');
      await this.apply(m, user, 'communication_template', t.id, `${t.id} ${t.trigger}`, t, {
        subjectTemplate: subject,
        bodyTemplate: body,
      });
      await repo.save(t);
    });
  }

  /** Product type master (FR-142, FR-230): aliases the mail bot matches, BimaSetu codes, RFQ template, timing LOB. */
  updateProductType(user: AuthUser, code: string, dto: ProductTypePatchDto) {
    return this.save(async (m) => {
      const repo = m.getRepository(ProductType);
      const all = await repo.find();
      const p = all.find((x) => x.code === code);
      if (!p) throw DomainError.notFound('Product type', code);
      const clean = (list?: string[]) =>
        list === undefined ? undefined : [...new Set(list.map((s) => s.trim()).filter(Boolean))];
      const aliases = clean(dto.aliases);
      const codes = clean(dto.bimasetuCodes);
      for (const other of all.filter((x) => x.code !== code)) {
        const clash = aliases?.find((a) => other.aliases.some((o) => o.toLowerCase() === a.toLowerCase()));
        if (clash) throw DomainError.guard(`"${clash}" is already an alias of ${other.label}`);
        const codeClash = codes?.find((c) => other.bimasetuCodes.includes(c));
        if (codeClash) throw DomainError.guard(`BimaSetu code "${codeClash}" already maps to ${other.label}`);
      }
      if (dto.rfqTemplate !== undefined && !dto.rfqTemplate.trim())
        throw DomainError.guard('A product type needs an RFQ template');
      await this.apply(m, user, 'product_type', p.code, p.label, p, {
        aliases,
        bimasetuCodes: codes,
        rfqTemplate: dto.rfqTemplate?.trim(),
        timingLob: dto.timingLob,
        active: dto.active,
      });
      await repo.save(p);
    });
  }

  // ---- helpers ----

  /** Runs the edit in one transaction, then reloads the SLA config in this process (others poll the log). */
  private async save(fn: (m: EntityManager) => Promise<void>): Promise<AdminMastersView> {
    await this.ds.transaction(fn);
    await this.sla.refresh();
    return this.admin({ withMailboxes: false });
  }

  /** Copies changed fields onto the row, one change-log entry per field (FR-148). */
  private async apply<T extends object>(
    m: EntityManager,
    user: AuthUser,
    entityType: string,
    entityId: string,
    entityLabel: string,
    target: T,
    patch: Partial<Record<keyof T, unknown>>,
  ) {
    const row = target as Record<string, unknown>;
    for (const [field, after] of Object.entries(patch)) {
      if (after === undefined) continue;
      const before = row[field];
      if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) continue;
      await recordChange(m, user, { entityType, entityId, entityLabel, field, before, after });
      row[field] = after;
    }
  }

  private current(key: string): unknown {
    switch (key) {
      case 'thresholds':
        return { ...this.sla.thresholds };
      case 'sla_p1':
        return { ...this.sla.slaP1 };
      case 'follow_up_ladder':
        return this.sla.followUpLadder;
      case 'business_calendar':
        return { ...BUSINESS_CALENDAR_DEFAULTS };
      default:
        return null;
    }
  }

  private isoDate(s: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !DateTime.fromISO(s).isValid)
      throw DomainError.guard('Dates must be YYYY-MM-DD');
    return s;
  }

  private editableKind(kind: string): EditableLookupKind {
    if (!(EDITABLE_LOOKUP_KINDS as readonly string[]).includes(kind))
      throw DomainError.guard(`The "${kind}" list is fixed and cannot be edited here`);
    return kind as EditableLookupKind;
  }
}
