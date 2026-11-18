import { MigrationInterface, QueryRunner } from 'typeorm';

/** FR-290: an RM information request is sent to BimaSetu as a ticket-scoped IR-nn, never as the insurer thread ref. */
export class ThreadInfoRequestRef1793380000000 implements MigrationInterface {
  name = 'ThreadInfoRequestRef1793380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "thread_clarifications" ADD "rm_query_ref" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "thread_clarifications" DROP COLUMN "rm_query_ref"`);
  }
}
