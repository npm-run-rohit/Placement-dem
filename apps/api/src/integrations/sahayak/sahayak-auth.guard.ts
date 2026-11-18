import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { Role } from '@bimaplacement/contracts';
import type { AppConfig } from '../../config/configuration';
import { PUBLIC_KEY } from '../../common/auth/roles.decorator';
import { RequestContext } from '../../common/context/request-context';
import type { AuthUser } from '../../common/auth/auth.types';
import { UsersService } from '../../modules/users/users.service';

/**
 * Authentication against BimaSahayak (umbrella identity). Sahayak fronts Google Workspace SSO (OIDC)
 * and issues a JWT for the Placement audience with role claims:
 *   { sub, email, name, picture, roles: ['placement_manager' | 'placement_head' | 'placement_admin' | 'rm'], scopes?: [...] }
 * Claim names are an ASSUMPTION - confirm with the Sahayak team (see docs/architecture/HLD.md s6).
 *
 * AUTH_MODE=dev: accepts `x-dev-user: <email>|<name>|<role,role>` for local work only.
 */
@Injectable()
export class SahayakAuthGuard implements CanActivate {
  private readonly logger = new Logger(SahayakAuthGuard.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]))
      return true;
    const req = ctx.switchToHttp().getRequest();
    const auth = this.config.get('auth', { infer: true });

    let claims: { sub: string; email: string; name: string; roles: Role[]; picture?: string };
    if (auth.mode === 'dev') {
      const header =
        (req.headers['x-dev-user'] as string) ?? 'himani@bimakavach.com|Himani Doshi|placement_head';
      const [email, name, roles] = header.split('|');
      claims = {
        sub: `dev:${email}`,
        email,
        name,
        roles: (roles ?? 'placement_manager').split(',') as Role[],
      };
    } else {
      const token = (req.headers.authorization as string | undefined)?.replace(/^Bearer /, '');
      if (!token) throw new UnauthorizedException();
      this.jwks ??= createRemoteJWKSet(new URL(auth.jwksUrl));
      try {
        const { payload } = await jwtVerify(token, this.jwks, {
          issuer: auth.issuer,
          audience: auth.audience,
        });
        claims = this.fromPayload(payload);
      } catch (e) {
        this.logger.debug(`token rejected: ${(e as Error).message}`);
        throw new UnauthorizedException();
      }
    }

    const local = await this.users.upsertFromSahayak({
      sahayakUserId: claims.sub,
      email: claims.email,
      name: claims.name,
      roles: claims.roles,
      avatarUrl: claims.picture ?? null,
    });
    const user: AuthUser = {
      id: local.id,
      sahayakUserId: claims.sub,
      email: claims.email,
      name: claims.name,
      roles: claims.roles,
    };
    req.user = user;
    const store = RequestContext.get();
    if (store) store.user = user;
    return true;
  }

  private fromPayload(p: JWTPayload) {
    const roles = ((p['roles'] as string[]) ?? []).filter((r): r is Role =>
      Object.values(Role).includes(r as Role),
    );
    return {
      sub: p.sub!,
      email: p['email'] as string,
      name: (p['name'] as string) ?? (p['email'] as string),
      roles,
      picture: p['picture'] as string | undefined,
    };
  }
}
