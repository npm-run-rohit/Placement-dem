import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@bimaplacement/contracts';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator';
import { DomainError } from '../errors/domain-error';
import type { AuthUser } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (user?.roles.some((r) => required.includes(r))) return true;
    throw new DomainError('FORBIDDEN', `Requires one of: ${required.join(', ')}`);
  }
}
