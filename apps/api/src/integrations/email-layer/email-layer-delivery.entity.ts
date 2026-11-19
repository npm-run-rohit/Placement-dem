import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import type { DeliveryPayload } from './contract';

/** One row per delivery the email layer pushed to the webhook; `deliveryId` is the dedupe key. */
@Entity('email_layer_deliveries')
@Index('ix_email_layer_deliveries_status', ['status', 'createdAt'])
export class EmailLayerDelivery {
  @PrimaryColumn({ name: 'delivery_id', type: 'text' })
  deliveryId: string;

  @Column({ type: 'jsonb' })
  payload: DeliveryPayload;

  @Column({ type: 'text' })
  status: 'processed' | 'rejected' | 'failed';

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
