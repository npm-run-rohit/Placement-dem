import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written bootstrap that `migration:generate` cannot express:
 *  - extensions (citext for case-insensitive emails, pgcrypto for gen_random_uuid)
 *  - ticket number sequence (PLC-1001 onward, FR-200)
 *  - append-only guard on audit_events (BR-094, 10.6) - applied in the follow-up migration once the
 *    table exists (see TODO in PLAN.md Phase 0, step "first schema migration").
 * Run order: this file, then the generated schema migration, then 1730000000002-AuditImmutability.
 */
export class Bootstrap1730000000000 implements MigrationInterface {
  name = 'Bootstrap1730000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await q.query(`CREATE SEQUENCE IF NOT EXISTS placement_ticket_no_seq START WITH 1001`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SEQUENCE IF EXISTS placement_ticket_no_seq`);
  }
}
