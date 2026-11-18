import { SetMetadata } from '@nestjs/common';
import { Role } from '@bimaplacement/contracts';

export const ROLES_KEY = 'roles';
/** Restrict a route to any of the given roles (see PRD 6 permission matrix). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'isPublic';
/** Skip authentication (health checks, signed webhooks that use their own guard). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
