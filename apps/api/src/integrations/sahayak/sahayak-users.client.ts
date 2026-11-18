import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { DomainError } from '../../common/errors/domain-error';

export interface SahayakUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  active: boolean;
  avatarUrl?: string;
  outOfOffice?: boolean;
}

/**
 * Directory lookups on BimaSahayak (Placement users + RMs - PRD dependency "Placement user directory").
 * Used by the nightly user sync and the Create Ticket RM picker. TODO(W1): confirm endpoints.
 */
@Injectable()
export class SahayakUsersClient {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async listByRole(_role: string): Promise<SahayakUser[]> {
    const { apiUrl } = this.config.get('sahayak', { infer: true });
    if (!apiUrl) return [];
    throw DomainError.notImplemented('SahayakUsersClient.listByRole');
  }
}
