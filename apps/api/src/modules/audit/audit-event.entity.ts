import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ActorType } from '@bimaplacement/contracts';

/**
 * Immutable audit timeline (FR-149, BR-094, 10.6). Append-only: the initial migration must add
 * a trigger rejecting UPDATE/DELETE and revoke those privileges from the app role.
 */
@Entity('audit_events')
@Index('ix_audit_ticket_at', ['ticketId', 'at'])
@Index('ix_audit_entity', ['entityType', 'entityId'])
export class AuditEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  @Column({ name: 'entity_type', type: 'text' })
  entityType: string; // ticket | rfq | thread | quote | qcr | mandate | master | config | integration

  @Column({ name: 'entity_id', type: 'text' })
  entityId: string;

  @Column({ name: 'actor_type', type: 'text' })
  actorType: ActorType;

  @Column({ name: 'actor_id', type: 'text', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_name', type: 'text' })
  actorName: string;

  /** Human event title, e.g. "RFQ V1 validated" (wording from the prototype audit trail). */
  @Column({ type: 'text' })
  event: string;

  @Column({ type: 'text', default: '' })
  detail: string;

  @Column({ type: 'jsonb', nullable: true })
  before: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  @Column({ type: 'jsonb', nullable: true })
  after: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  @Column({ name: 'correlation_id', type: 'text', nullable: true })
  correlationId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
