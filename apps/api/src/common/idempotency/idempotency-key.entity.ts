import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One row per (user, Idempotency-Key) on a mutating call (PRD 10.2). `statusCode` is null while the
 * first request is still running; afterwards the stored response is replayed for 24 hours.
 */
@Entity('idempotency_keys')
@Index('ux_idempotency_user_key', ['userId', 'key'], { unique: true })
@Index('ix_idempotency_created', ['createdAt'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ type: 'text' })
  key: string;

  /** sha256 of method + path + body: a key reused for a different request is refused. */
  @Column({ name: 'request_hash', type: 'text' })
  requestHash: string;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: 'jsonb', nullable: true })
  response: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
