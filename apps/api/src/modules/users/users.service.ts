import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '@bimaplacement/contracts';
import { User } from './user.entity';
import { DomainError } from '../../common/errors/domain-error';
import { PENDING_SAHAYAK_PREFIX } from './users.constants';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  /** Upsert the local projection from Sahayak token claims (called by the auth guard). */
  async upsertFromSahayak(input: {
    sahayakUserId: string;
    email: string;
    name: string;
    roles: Role[];
    avatarUrl?: string | null;
  }) {
    let user = await this.repo.findOne({ where: { sahayakUserId: input.sahayakUserId } });
    // first login of a user loaded by the masters import: claim that row so tickets already assigned stay theirs
    if (!user)
      user = await this.repo
        .createQueryBuilder('u')
        .where('lower(u.email) = lower(:email)', { email: input.email })
        .andWhere('u.sahayak_user_id LIKE :pending', { pending: `${PENDING_SAHAYAK_PREFIX}%` })
        .getOne();
    if (user?.sahayakUserId.startsWith(PENDING_SAHAYAK_PREFIX)) user.sahayakUserId = input.sahayakUserId;
    if (!user) user = this.repo.create({ ...input, mailboxAddress: input.email });
    else
      Object.assign(user, {
        email: input.email,
        name: input.name,
        roles: input.roles,
        avatarUrl: input.avatarUrl ?? user.avatarUrl,
      });
    return this.repo.save(user);
  }

  async get(id: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw DomainError.notFound('User', id);
    return u;
  }

  /** Placement Head(s) - fallback owner for unmatched tickets and SLA-P1 escalation target. */
  async heads() {
    return this.repo
      .createQueryBuilder('u')
      .where(':role = ANY(u.roles)', { role: Role.PLACEMENT_HEAD })
      .andWhere('u.active')
      .getMany();
  }

  async placementManagers() {
    return this.repo
      .createQueryBuilder('u')
      .where(':role = ANY(u.roles)', { role: Role.PLACEMENT_MANAGER })
      .andWhere('u.active')
      .getMany();
  }

  async rms() {
    return this.repo
      .createQueryBuilder('u')
      .where(':role = ANY(u.roles)', { role: Role.RM })
      .andWhere('u.active')
      .getMany();
  }
}
