import {
  BranchStatus,
  BusinessType,
  EntityLockReason,
  InsurerStatus,
  ProductGroup,
  ProductTypeCode,
} from '@bimaplacement/contracts';
import { computeSelectableEntities, type EligibilityInsurer } from './eligibility';

const poc = (g: ProductGroup) => ({
  id: `p-${g}`,
  name: 'POC',
  email: 'poc@x.com',
  ccEmails: [] as string[],
  productGroup: g,
  active: true,
});
const insurers: EligibilityInsurer[] = [
  {
    id: 'icici',
    name: 'ICICI Lombard',
    status: InsurerStatus.ACTIVE,
    appetite: [ProductTypeCode.GMC],
    branches: [
      { id: 'b1', name: 'Mumbai', status: BranchStatus.ACTIVE, pocs: [poc(ProductGroup.EB)] },
      { id: 'b2', name: 'Indore', status: BranchStatus.INACTIVE, pocs: [poc(ProductGroup.EB)] },
    ],
  },
  {
    id: 'oriental',
    name: 'Oriental',
    status: InsurerStatus.DO_NOT_FLOAT,
    appetite: [],
    branches: [{ id: 'b3', name: '', status: BranchStatus.ACTIVE, pocs: [poc(ProductGroup.EB)] }],
  },
  {
    id: 'hdfc',
    name: 'HDFC ERGO',
    status: InsurerStatus.ACTIVE,
    appetite: [],
    branches: [{ id: 'b4', name: '', status: BranchStatus.ACTIVE, pocs: [poc(ProductGroup.LIABILITY)] }],
  },
];

describe('insurer eligibility', () => {
  const ticket = {
    productGroup: ProductGroup.EB,
    productType: ProductTypeCode.GMC,
    businessType: BusinessType.NEW,
    incumbentInsurerId: null,
    hasIncumbentMandate: false,
  };

  it('lists insurer+branch entities with POCs for the product group', () => {
    const e = computeSelectableEntities(insurers, ticket);
    expect(e.map((x) => x.label)).toEqual(['ICICI Lombard - Mumbai', 'ICICI Lombard - Indore', 'Oriental']);
  });

  it('locks Do Not Float and inactive branches', () => {
    const e = computeSelectableEntities(insurers, ticket);
    expect(e.find((x) => x.branchId === 'b2')?.lock).toBe(EntityLockReason.BRANCH_INACTIVE);
    expect(e.find((x) => x.insurerId === 'oriental')?.lock).toBe(EntityLockReason.DO_NOT_FLOAT);
  });

  it('blocks the rollover incumbent without an Incumbent Approach Mandate', () => {
    const e = computeSelectableEntities(insurers, {
      ...ticket,
      businessType: BusinessType.ROLLOVER,
      incumbentInsurerId: 'icici',
    });
    expect(e.find((x) => x.branchId === 'b1')?.lock).toBe(EntityLockReason.INCUMBENT_MANDATE_NEEDED);
    const ok = computeSelectableEntities(insurers, {
      ...ticket,
      businessType: BusinessType.ROLLOVER,
      incumbentInsurerId: 'icici',
      hasIncumbentMandate: true,
    });
    expect(ok.find((x) => x.branchId === 'b1')?.lock).toBeNull();
  });

  it("copies the POCs' CC addresses once, leaving out anyone already in To", () => {
    const withCc: EligibilityInsurer[] = [
      {
        ...insurers[0],
        branches: [
          {
            id: 'b1',
            name: 'Mumbai',
            status: BranchStatus.ACTIVE,
            pocs: [
              {
                ...poc(ProductGroup.EB),
                id: 'p1',
                email: 'asha@x.com',
                ccEmails: ['Boss@x.com', 'vik@x.com'],
              },
              {
                ...poc(ProductGroup.EB),
                id: 'p2',
                email: 'vik@x.com',
                ccEmails: ['boss@x.com', 'desk@x.com'],
              },
              { ...poc(ProductGroup.LIABILITY), id: 'p3', email: 'lia@x.com', ccEmails: ['liab-cc@x.com'] },
            ],
          },
        ],
      },
    ];
    const [e] = computeSelectableEntities(withCc, ticket);
    expect(e.pocs.map((p) => p.email)).toEqual(['asha@x.com', 'vik@x.com']);
    expect(e.ccEmails).toEqual(['Boss@x.com', 'desk@x.com']);
  });
});
