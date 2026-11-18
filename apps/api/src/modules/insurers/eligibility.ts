import {
  BranchStatus,
  BusinessType,
  EntityLockReason,
  InsurerStatus,
  ProductGroup,
  ProductTypeCode,
} from '@bimaplacement/contracts';

export interface EligibilityInsurer {
  id: string;
  name: string;
  status: InsurerStatus;
  appetite: ProductTypeCode[];
  branches: Array<{
    id: string;
    name: string;
    status: BranchStatus;
    pocs: Array<{ id: string; name: string; email: string; productGroup: ProductGroup; active: boolean }>;
  }>;
}

export interface SelectableEntity {
  insurerId: string;
  branchId: string;
  label: string; // "ICICI Lombard - Mumbai" or just the insurer name
  pocs: Array<{ pocId: string; name: string; email: string }>;
  inAppetite: boolean; // chip only, never blocks (FR-210)
  lock: EntityLockReason | null;
}

/**
 * Insurer + branch entities for a ticket (M4, FR-211..214, BR-021/026/127).
 * Hard filters: insurer status, branch status, rollover incumbent without Incumbent Approach Mandate,
 * and POCs for the ticket's product group. Locked entities are returned (visible with reason) but
 * cannot be selected - enforced again server-side on every add path (FR-212).
 */
export function computeSelectableEntities(
  insurers: EligibilityInsurer[],
  ticket: {
    productGroup: ProductGroup;
    productType: ProductTypeCode;
    businessType: BusinessType;
    incumbentInsurerId: string | null;
    hasIncumbentMandate: boolean;
  },
  opts: { includeWithoutPoc?: boolean } = {},
): SelectableEntity[] {
  const out: SelectableEntity[] = [];
  for (const ins of insurers) {
    for (const br of ins.branches) {
      const pocs = br.pocs.filter((p) => p.active && p.productGroup === ticket.productGroup);
      if (!pocs.length && !opts.includeWithoutPoc) continue;
      let lock: EntityLockReason | null = null;
      if (ins.status === InsurerStatus.DO_NOT_FLOAT) lock = EntityLockReason.DO_NOT_FLOAT;
      else if (ins.status === InsurerStatus.INACTIVE) lock = EntityLockReason.INACTIVE;
      else if (br.status === BranchStatus.INACTIVE) lock = EntityLockReason.BRANCH_INACTIVE;
      else if (!pocs.length) lock = EntityLockReason.NO_POC;
      else if (
        ticket.businessType === BusinessType.ROLLOVER &&
        ticket.incumbentInsurerId === ins.id &&
        !ticket.hasIncumbentMandate
      )
        lock = EntityLockReason.INCUMBENT_MANDATE_NEEDED;
      out.push({
        insurerId: ins.id,
        branchId: br.id,
        label: br.name ? `${ins.name} - ${br.name}` : ins.name,
        pocs: pocs.map((p) => ({ pocId: p.id, name: p.name, email: p.email })),
        inAppetite: ins.appetite.includes(ticket.productType),
        lock,
      });
    }
  }
  return out;
}
