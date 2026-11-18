import { MigrationInterface, QueryRunner } from 'typeorm';

export class MailMessageOutboxId1793271115828 implements MigrationInterface {
  name = 'MailMessageOutboxId1793271115828';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mail_messages" ADD "outbox_id" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_mail_outbox" ON "mail_messages" ("outbox_id") WHERE outbox_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."ux_mail_outbox"`);
    await queryRunner.query(`ALTER TABLE "mail_messages" DROP COLUMN "outbox_id"`);
  }
}
