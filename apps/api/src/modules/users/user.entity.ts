import { Column, Entity, Index } from 'typeorm';
import { Role } from '@bimaplacement/contracts';
import { BaseEntity } from '../../common/persistence/base.entity';

/**
 * Local projection of a BimaSahayak user. Identity, roles and the user directory are owned
 * by BimaSahayak; this row is upserted on login / on Sahayak user.* events so foreign keys
 * (owner, actor, assignee) stay local and fast.
 */
@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'sahayak_user_id', type: 'text' })
  sahayakUserId: string;

  @Index({ unique: true })
  @Column({ type: 'citext' })
  email: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', array: true, default: '{}' })
  roles: Role[];

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** PM mailbox identity used for outbound insurer mail (FR-168). Defaults to email. */
  @Column({ name: 'mailbox_address', type: 'text', nullable: true })
  mailboxAddress: string | null;

  /** Opaque provider cursor for inbound polling (Gmail historyId / Graph delta). */
  @Column({ name: 'mailbox_cursor', type: 'text', nullable: true })
  mailboxCursor: string | null;

  @Column({ name: 'out_of_office', type: 'boolean', default: false })
  outOfOffice: boolean;
}
