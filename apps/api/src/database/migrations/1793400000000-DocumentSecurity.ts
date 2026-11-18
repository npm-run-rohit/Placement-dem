import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN 4.5: document access log (append-only, like audit_events) and malware scan results. Files stored before
 * scanning existed are marked 'skipped' so they stay readable; new files are stored only when they scan clean.
 */
export class DocumentSecurity1793400000000 implements MigrationInterface {
  name = 'DocumentSecurity1793400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "document_access_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "document_id" uuid NOT NULL, "ticket_id" uuid, "user_id" uuid NOT NULL, "action" text NOT NULL, "ip" text, "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_document_access_log" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `CREATE INDEX "ix_document_access_document" ON "document_access_log" ("document_id", "at")`,
    );
    await q.query(
      `CREATE TRIGGER document_access_log_append_only BEFORE UPDATE OR DELETE ON document_access_log FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`,
    );
    await q.query(`ALTER TABLE "documents" ADD "scan_engine" text`);
    await q.query(`ALTER TABLE "documents" ADD "scanned_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`UPDATE "documents" SET "scan_status" = 'skipped' WHERE "scan_status" = 'pending'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "documents" DROP COLUMN "scanned_at"`);
    await q.query(`ALTER TABLE "documents" DROP COLUMN "scan_engine"`);
    await q.query(`DROP TABLE "document_access_log"`);
  }
}
