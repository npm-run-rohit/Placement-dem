import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Immutable history (CLAUDE.md rule 5, FR-103): a released QCR and a floated RFQ version never change and are
 * never deleted. The one allowed change is the status moving to `superseded` when RFQ V2 replaces them
 * (FR-252). Quote rows of a released QCR are frozen with it.
 */
export class ReleasedVersionsImmutable1793370000000 implements MigrationInterface {
  name = 'ReleasedVersionsImmutable1793370000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION forbid_frozen_version_change() RETURNS trigger AS $$
      DECLARE frozen boolean;
      BEGIN
        -- read through jsonb: plpgsql resolves OLD.<column> even in a branch for the other table
        frozen := (to_jsonb(OLD) ->> CASE TG_TABLE_NAME WHEN 'qcr_versions' THEN 'released_at' ELSE 'floated_at' END) IS NOT NULL;
        IF NOT frozen THEN RETURN COALESCE(NEW, OLD); END IF;
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% row % is frozen and cannot be deleted', TG_TABLE_NAME, OLD.id; END IF;
        IF NEW.status NOT IN (OLD.status, 'superseded')
           OR (to_jsonb(NEW) - 'status' - 'updated_at' - 'row_version') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at' - 'row_version') THEN
          RAISE EXCEPTION '% row % is frozen: only a move to superseded is allowed', TG_TABLE_NAME, OLD.id;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await q.query(
      `CREATE TRIGGER qcr_versions_frozen BEFORE UPDATE OR DELETE ON qcr_versions FOR EACH ROW EXECUTE FUNCTION forbid_frozen_version_change()`,
    );
    await q.query(
      `CREATE TRIGGER rfq_versions_frozen BEFORE UPDATE OR DELETE ON rfq_versions FOR EACH ROW EXECUTE FUNCTION forbid_frozen_version_change()`,
    );

    await q.query(`
      CREATE OR REPLACE FUNCTION forbid_released_qcr_row_change() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM qcr_versions v WHERE v.id = OLD.qcr_id AND v.released_at IS NOT NULL) THEN
          RAISE EXCEPTION 'quote rows of a released QCR are frozen';
        END IF;
        RETURN COALESCE(NEW, OLD);
      END; $$ LANGUAGE plpgsql`);
    await q.query(
      `CREATE TRIGGER qcr_rows_frozen BEFORE UPDATE OR DELETE ON qcr_rows FOR EACH ROW EXECUTE FUNCTION forbid_released_qcr_row_change()`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS qcr_rows_frozen ON qcr_rows`);
    await q.query(`DROP TRIGGER IF EXISTS rfq_versions_frozen ON rfq_versions`);
    await q.query(`DROP TRIGGER IF EXISTS qcr_versions_frozen ON qcr_versions`);
    await q.query(`DROP FUNCTION IF EXISTS forbid_released_qcr_row_change()`);
    await q.query(`DROP FUNCTION IF EXISTS forbid_frozen_version_change()`);
  }
}
