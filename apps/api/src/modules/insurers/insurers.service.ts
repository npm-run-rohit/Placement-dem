import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BranchStatus,
  InsurerStatus,
  MandateType,
  PRODUCT_TYPES_SEED,
  ProductGroup,
  Role,
  type InsurerMasterRow,
  type MasterChangeView,
  type PanelEntityView,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import { Insurer } from './entities/insurer.entity';
import { InsurerBranch } from './entities/insurer-branch.entity';
import { InsurerPoc } from './entities/insurer-poc.entity';
import type { BranchDto, CreateInsurerDto, InsurerFieldsDto, PocDto } from './dto/insurers.dto';
import { changeViews, recordChange } from '../masters/change-log';
import { computeSelectableEntities, type SelectableEntity } from './eligibility';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { PanelSelection } from '../threads/entities/panel-selection.entity';
import { Mandate } from '../mandates/entities/mandate.entity';

@Injectable()
export class InsurersService {
  constructor(
    @InjectRepository(Insurer) private readonly insurers: Repository<Insurer>,
    private readonly dataSource: DataSource,
  ) {}

  /** Insurer Master screen (UI-SPEC 3.5): one row per insurer x branch, POCs per product group. */
  async master(search?: string) {
    const qb = this.insurers
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.branches', 'b')
      .leftJoinAndSelect('b.pocs', 'p', 'p.active = true')
      .orderBy('i.name')
      .addOrderBy('b.name')
      .addOrderBy('p.name') // stable POC order: mail recipients and the thread's POC snapshot
      .addOrderBy('p.email');
    if (search) qb.where('i.name ILIKE :s OR b.name ILIKE :s', { s: `%${search}%` });
    return qb.getMany();
  }

  /** Insurer Panel tab: every entity with its lock reason and appetite chip. */
  async entitiesForTicket(
    ticketId: string,
    opts: { includeWithoutPoc?: boolean } = {},
  ): Promise<SelectableEntity[]> {
    const ticket = await this.dataSource.getRepository(PlacementTicket).findOneByOrFail({ id: ticketId });
    const product = PRODUCT_TYPES_SEED.find((p) => p.code === ticket.productType);
    if (!product)
      throw DomainError.guard(`Product ${ticket.productType} is not mapped on the Product Type master`);
    const hasIncumbentMandate =
      (await this.dataSource
        .getRepository(Mandate)
        .count({ where: { ticketId, type: MandateType.INCUMBENT_APPROACH } })) > 0;
    const all = await this.master();
    return computeSelectableEntities(
      all.map((i) => ({
        id: i.id,
        name: i.name,
        status: i.status,
        appetite: i.appetite,
        branches: (i.branches ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          status: b.status,
          pocs: (b.pocs ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            ccEmails: p.ccEmails,
            productGroup: p.productGroup,
            active: p.active,
          })),
        })),
      })),
      {
        productGroup: product.group,
        productType: ticket.productType,
        businessType: ticket.businessType,
        incumbentInsurerId: ticket.incumbentInsurerId,
        hasIncumbentMandate,
      },
      opts,
    );
  }

  /** Panel view: entities + selection on the active RFQ + names, logo and sectors for display (UI-SPEC 3.3.6a). */
  async panelForTicket(
    ticketId: string,
    opts: { includeWithoutPoc?: boolean } = {},
  ): Promise<PanelEntityView[]> {
    const ticket = await this.dataSource.getRepository(PlacementTicket).findOneByOrFail({ id: ticketId });
    const [entities, master, picks] = await Promise.all([
      this.entitiesForTicket(ticketId, opts),
      this.master(),
      this.dataSource
        .getRepository(PanelSelection)
        .find({ where: { ticketId, rfqVersion: ticket.activeRfqVersion } }),
    ]);
    // FR-132: who answered on an earlier RFQ version (anything beyond "sent" / "no response")
    const responded: Array<{ insurer_id: string; branch_id: string }> =
      ticket.activeRfqVersion > 1
        ? await this.dataSource.query(
            `SELECT DISTINCT insurer_id, branch_id FROM insurer_threads WHERE ticket_id = $1 AND rfq_version < $2 AND status NOT IN ('rfq_sent', 'no_response')`,
            [ticketId, ticket.activeRfqVersion],
          )
        : [];
    const views = entities.map((e) => {
      const ins = master.find((i) => i.id === e.insurerId);
      return {
        ...e,
        insurerName: ins?.name ?? e.label,
        branchName: ins?.branches?.find((b) => b.id === e.branchId)?.name || null,
        logoUrl: ins?.logoUrl ?? null,
        sectors: ins?.sectors ?? null,
        selected: picks.some((p) => p.insurerId === e.insurerId && p.branchId === e.branchId),
        priorResponder: responded.some((r) => r.insurer_id === e.insurerId && r.branch_id === e.branchId),
      };
    });
    // prior responders first, otherwise the master order is kept (stable sort)
    return views.sort((a, b) => Number(b.priorResponder) - Number(a.priorResponder));
  }

  /** Insurer Master screen rows (UI-SPEC 3.5): one per insurer x branch (an insurer with no branch still gets a row). */
  async masterRows(search?: string): Promise<InsurerMasterRow[]> {
    const all = await this.master(search);
    const pocsOf = (b: InsurerBranch | null) => {
      const by = { EB: [], Liability: [], 'P&C': [] } as InsurerMasterRow['pocs'];
      for (const p of b?.pocs ?? [])
        by[p.productGroup as keyof typeof by]?.push({
          id: p.id,
          name: p.name,
          email: p.email,
          designation: p.designation,
          phone: p.phone,
        });
      return by;
    };
    return all.flatMap((i) =>
      (i.branches?.length ? i.branches : [null]).map((b) => ({
        insurerId: i.id,
        code: i.code,
        name: i.name,
        brokingCode: i.brokingCode,
        logoUrl: i.logoUrl,
        sectors: i.sectors,
        note: i.note,
        status: i.status,
        appetite: i.appetite,
        branch: b ? { id: b.id, name: b.name, city: b.city, status: b.status } : null,
        pocs: pocsOf(b),
      })),
    );
  }

  /** Insurer Master history only; SLA / calendar / template edits show on the Admin screens. */
  changeLog(limit = 100): Promise<MasterChangeView[]> {
    return changeViews(this.dataSource, { types: ['insurer', 'branch', 'poc'], limit });
  }

  /** New insurer (+ the insurer-as-a-whole branch so POCs can be added straight away). FR-160/161. */
  async createInsurer(user: AuthUser, dto: CreateInsurerDto) {
    this.assertHead(user);
    const code =
      dto.code ??
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    if (await this.insurers.exist({ where: { code } }))
      throw DomainError.guard(`An insurer with code "${code}" already exists`);
    return this.dataSource.transaction(async (m) => {
      const ins = await m.getRepository(Insurer).save(
        m.getRepository(Insurer).create({
          code,
          name: dto.name,
          sectors: dto.sectors ?? null,
          note: dto.note ?? null,
          status: dto.status ?? InsurerStatus.ACTIVE,
          appetite: dto.appetite ?? [],
          brokingCode: dto.brokingCode ?? null,
          logoUrl: dto.logoUrl ?? null,
        }),
      );
      await m
        .getRepository(InsurerBranch)
        .save(
          m.getRepository(InsurerBranch).create({ insurerId: ins.id, name: '', status: BranchStatus.ACTIVE }),
        );
      await this.log(m, user, 'insurer', ins.id, ins.name, 'created', null, {
        code,
        status: ins.status,
        appetite: ins.appetite,
      });
      return ins;
    });
  }

  /** Head-only insurer fields edit with before/after per field (FR-044, FR-160/161, BR-097). */
  async updateInsurer(user: AuthUser, insurerId: string, patch: InsurerFieldsDto) {
    this.assertHead(user);
    return this.dataSource.transaction(async (m) => {
      const ins = await m.getRepository(Insurer).findOneByOrFail({ id: insurerId });
      const changed = await this.applyFields(
        m,
        user,
        'insurer',
        ins.id,
        ins.name,
        ins as unknown as Record<string, unknown>,
        patch as Record<string, unknown>,
      );
      return changed ? m.getRepository(Insurer).save(ins) : ins;
    });
  }

  async addBranch(user: AuthUser, insurerId: string, dto: BranchDto) {
    this.assertHead(user);
    return this.dataSource.transaction(async (m) => {
      const ins = await m.getRepository(Insurer).findOneByOrFail({ id: insurerId });
      const name = (dto.name ?? '').trim();
      if (await m.getRepository(InsurerBranch).exist({ where: { insurerId, name } }))
        throw DomainError.guard(`${ins.name} already has a branch "${name || '(insurer as a whole)'}"`);
      const b = await m
        .getRepository(InsurerBranch)
        .save(
          m
            .getRepository(InsurerBranch)
            .create({ insurerId, name, city: dto.city ?? null, status: dto.status ?? BranchStatus.ACTIVE }),
        );
      await this.log(m, user, 'branch', b.id, this.branchLabel(ins, b), 'created', null, {
        name,
        status: b.status,
      });
      if (dto.pocs) await this.syncPocs(m, user, ins, b, dto.pocs);
      return b;
    });
  }

  /** The edit drawer's save: branch fields + the full POC list per group sent (UI-SPEC 4 PlInsurerEditDrawer). */
  async updateBranch(user: AuthUser, insurerId: string, branchId: string, dto: BranchDto) {
    this.assertHead(user);
    return this.dataSource.transaction(async (m) => {
      const ins = await m.getRepository(Insurer).findOneByOrFail({ id: insurerId });
      const b = await m.getRepository(InsurerBranch).findOneBy({ id: branchId, insurerId });
      if (!b) throw DomainError.guard('That branch is not on this insurer');
      const { pocs, ...fields } = dto;
      if (fields.name !== undefined) fields.name = fields.name.trim();
      if (
        fields.name !== undefined &&
        fields.name !== b.name &&
        (await m.getRepository(InsurerBranch).exist({ where: { insurerId, name: fields.name } }))
      ) {
        throw DomainError.guard(
          `${ins.name} already has a branch "${fields.name || '(insurer as a whole)'}"`,
        );
      }
      if (
        await this.applyFields(
          m,
          user,
          'branch',
          b.id,
          this.branchLabel(ins, b),
          b as unknown as Record<string, unknown>,
          fields as Record<string, unknown>,
        )
      )
        await m.getRepository(InsurerBranch).save(b);
      if (pocs) await this.syncPocs(m, user, ins, b, pocs);
      return b;
    });
  }

  // ---------------------------------------------------------------------------------------------

  private assertHead(user: AuthUser) {
    if (!user.roles.includes(Role.PLACEMENT_HEAD) && !user.roles.includes(Role.ADMIN)) {
      throw new DomainError('FORBIDDEN', 'Only the Placement Head maintains the Insurer Master');
    }
  }

  private branchLabel(ins: Insurer, b: InsurerBranch) {
    return b.name ? `${ins.name} · ${b.name}` : ins.name;
  }

  private async applyFields(
    m: EntityManager,
    user: AuthUser,
    type: string,
    id: string,
    label: string,
    target: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) {
    let changed = false;
    for (const [field, after] of Object.entries(patch)) {
      if (after === undefined) continue;
      const before = target[field];
      if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) continue;
      await this.log(m, user, type, id, label, field, before ?? null, after ?? null);
      target[field] = after;
      changed = true;
    }
    return changed;
  }

  /** Sent groups are the full list: new emails added, changed names/phones updated, missing ones retired (FR-161). */
  private async syncPocs(
    m: EntityManager,
    user: AuthUser,
    ins: Insurer,
    b: InsurerBranch,
    groups: NonNullable<BranchDto['pocs']>,
  ) {
    const repo = m.getRepository(InsurerPoc);
    const label = this.branchLabel(ins, b);
    for (const [group, list] of Object.entries(groups) as Array<[ProductGroup, PocDto[]]>) {
      if (!Object.values(ProductGroup).includes(group))
        throw DomainError.guard(`Unknown product group "${group}"`);
      for (const p of list) {
        if (!p?.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email ?? ''))
          throw DomainError.guard(`Each ${group} POC needs a name and a valid email`);
      }
      const emails = list.map((p) => p.email.trim().toLowerCase());
      if (new Set(emails).size !== emails.length)
        throw DomainError.guard(`The same POC email appears twice under ${group}`);
      const current = await repo.find({ where: { branchId: b.id, productGroup: group } });
      for (const p of list) {
        const email = p.email.trim().toLowerCase();
        const existing = current.find((c) => c.email.toLowerCase() === email);
        if (!existing) {
          const poc = await repo.save(
            repo.create({
              branchId: b.id,
              productGroup: group,
              name: p.name.trim(),
              email,
              designation: p.designation ?? null,
              phone: p.phone ?? null,
              active: true,
            }),
          );
          await this.log(m, user, 'poc', poc.id, `${label} · ${group}`, 'added', null, {
            name: poc.name,
            email,
          });
          continue;
        }
        const changed = await this.applyFields(
          m,
          user,
          'poc',
          existing.id,
          `${label} · ${group} · ${existing.email}`,
          existing as unknown as Record<string, unknown>,
          {
            name: p.name.trim(),
            designation: p.designation,
            phone: p.phone,
            active: true,
          },
        );
        if (changed) await repo.save(existing);
      }
      for (const gone of current.filter((c) => c.active && !emails.includes(c.email.toLowerCase()))) {
        gone.active = false;
        await repo.save(gone);
        await this.log(
          m,
          user,
          'poc',
          gone.id,
          `${label} · ${group}`,
          'retired',
          { name: gone.name, email: gone.email },
          null,
        );
      }
    }
  }

  private log(
    m: EntityManager,
    user: AuthUser,
    entityType: string,
    entityId: string,
    entityLabel: string,
    field: string,
    before: unknown,
    after: unknown,
  ) {
    // TODO(W9): notify the master owner on material change (M4 notifications)
    return recordChange(m, user, { entityType, entityId, entityLabel, field, before, after });
  }
}
