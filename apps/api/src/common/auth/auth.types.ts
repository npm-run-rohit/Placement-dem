import { Role } from '@bimaplacement/contracts';

/** The authenticated principal, built from a BimaSahayak access token (or dev header locally). */
export interface AuthUser {
  /** Local users.id (uuid) - resolved/upserted from the Sahayak subject on first request. */
  id: string;
  sahayakUserId: string;
  email: string;
  name: string;
  roles: Role[];
  /** Product-group / LOB scoping from Sahayak claims, if any (W1 RBAC: LOB and team scoping). */
  scopes?: string[];
}

export const isHead = (u: AuthUser) => u.roles.includes(Role.PLACEMENT_HEAD);
export const isPlacementUser = (u: AuthUser) =>
  u.roles.some((r) => r === Role.PLACEMENT_MANAGER || r === Role.PLACEMENT_HEAD);
