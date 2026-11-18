import { Column, Entity, Index } from 'typeorm';
import { CopycatStatus } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';

/**
 * One Copycat generation attempt (FR-238..243). request_id CC-<ticket>-V<qcr>-<attempt> is unique;
 * a single runner sends it at most once; responses for a non-current request id are ignored.
 */
@Entity('copycat_requests')
export class CopycatRequest extends BaseEntity {
  @Column({ name: 'qcr_id', type: 'uuid' })
  qcrId: string;

  @Index({ unique: true })
  @Column({ name: 'request_id', type: 'text' })
  requestId: string;

  @Column({ type: 'int' })
  attempt: number;

  @Column({ type: 'text', default: CopycatStatus.QUEUED })
  status: CopycatStatus;

  @Column({ type: 'jsonb' })
  documents: Array<{
    quoteId: string;
    insurerId: string;
    insurer: string;
    documentId: string;
    fileName: string;
    version: number;
  }>;

  @Column({ name: 'queued_at', type: 'timestamptz' })
  queuedAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'result_document_id', type: 'uuid', nullable: true })
  resultDocumentId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;
}
