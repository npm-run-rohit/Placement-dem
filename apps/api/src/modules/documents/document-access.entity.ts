import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Who opened which document and when (PLAN 4.5, DPDP access logging). Append-only (DB trigger). */
@Entity('document_access_log')
@Index('ix_document_access_document', ['documentId', 'at'])
export class DocumentAccess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  action: 'view' | 'download';

  @Column({ type: 'text', nullable: true })
  ip: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
