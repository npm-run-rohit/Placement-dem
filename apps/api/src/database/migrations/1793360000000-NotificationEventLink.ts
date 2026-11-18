import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationEventLink1793360000000 implements MigrationInterface {
  name = 'NotificationEventLink1793360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" ADD "outbox_id" uuid`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD "event_type" text`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD "link" text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_notification_event_recipient" ON "notifications" ("outbox_id", "recipient_user_id") WHERE outbox_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."ux_notification_event_recipient"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "link"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "event_type"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "outbox_id"`);
  }
}
