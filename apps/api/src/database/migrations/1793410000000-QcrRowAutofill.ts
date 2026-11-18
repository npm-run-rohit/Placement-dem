import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * QCR quote rows autofill (FR-286, Rohit 2026-11-02): per field, the value filled from Copycat's comparison or the
 * quote record, and which fields the PM has since edited. Released rows stay frozen (qcr_rows_frozen trigger).
 */
export class QcrRowAutofill1793410000000 implements MigrationInterface {
  name = 'QcrRowAutofill1793410000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "qcr_rows" ADD "autofill" jsonb NOT NULL DEFAULT '{}'`);
    await q.query(`ALTER TABLE "qcr_rows" ADD "edited" text[] NOT NULL DEFAULT '{}'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "qcr_rows" DROP COLUMN "edited"`);
    await q.query(`ALTER TABLE "qcr_rows" DROP COLUMN "autofill"`);
  }
}
