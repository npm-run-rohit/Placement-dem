import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Masters are retired, never deleted (CLAUDE.md rule 5): a holiday removed on the Business Calendar master is retired.
 * master_change_log.changed_at is indexed: every process polls max(changed_at) to reload the SLA config.
 */
export class HolidayRetire1793390000000 implements MigrationInterface {
  name = 'HolidayRetire1793390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "holidays" ADD "active" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`CREATE INDEX "ix_master_change_at" ON "master_change_log" ("changed_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_master_change_at"`);
    await queryRunner.query(`ALTER TABLE "holidays" DROP COLUMN "active"`);
  }
}
