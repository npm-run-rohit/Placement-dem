import { MigrationInterface, QueryRunner } from 'typeorm';

/** Shared email layer: inbox of signed deliveries (dedupe on deliveryId, failures visible to ops). */
export class EmailLayerInbox1793440000000 implements MigrationInterface {
  name = 'EmailLayerInbox1793440000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "email_layer_deliveries" (
      "delivery_id" text PRIMARY KEY,
      "payload" jsonb NOT NULL,
      "status" text NOT NULL,
      "last_error" text,
      "attempts" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "processed_at" timestamptz
    )`);
    await q.query(
      `CREATE INDEX "ix_email_layer_deliveries_status" ON "email_layer_deliveries" ("status", "created_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "email_layer_deliveries"`);
  }
}
