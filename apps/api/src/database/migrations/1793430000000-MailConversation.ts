import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shared email layer: each mail row carries its conversation ref (PLC-nnnn/TH-nn or PLC-nnnn/RM) and the
 * provider's thread id, so a follow-up replies inside the same conversation.
 */
export class MailConversation1793430000000 implements MigrationInterface {
  name = 'MailConversation1793430000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mail_messages" ADD "conversation_ref" text`);
    await q.query(`ALTER TABLE "mail_messages" ADD "provider_thread_id" text`);
    await q.query(`CREATE INDEX "ix_mail_conversation" ON "mail_messages" ("conversation_ref", "at")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "ix_mail_conversation"`);
    await q.query(`ALTER TABLE "mail_messages" DROP COLUMN "provider_thread_id"`);
    await q.query(`ALTER TABLE "mail_messages" DROP COLUMN "conversation_ref"`);
  }
}
