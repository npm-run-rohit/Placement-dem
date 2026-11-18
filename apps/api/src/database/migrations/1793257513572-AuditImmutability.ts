import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Append-only guard for audit-grade tables (BR-094, PRD 10.6, IRDAI record retention). */
export class AuditImmutability1793257513572 implements MigrationInterface {
  name = 'AuditImmutability1793257513572';

  private readonly tables = ['audit_events', 'thread_events', 'sla_events', 'master_change_log'];

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql`);
    for (const t of this.tables) {
      await q.query(
        `CREATE TRIGGER ${t}_append_only BEFORE UPDATE OR DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION forbid_mutation()`,
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const t of this.tables) await q.query(`DROP TRIGGER IF EXISTS ${t}_append_only ON ${t}`);
    await q.query(`DROP FUNCTION IF EXISTS forbid_mutation()`);
  }
}
