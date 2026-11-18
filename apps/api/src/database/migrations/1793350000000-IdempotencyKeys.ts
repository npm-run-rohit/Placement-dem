import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdempotencyKeys1793350000000 implements MigrationInterface {
  name = 'IdempotencyKeys1793350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" text NOT NULL, "key" text NOT NULL, "request_hash" text NOT NULL, "status_code" integer, "response" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_idempotency_keys" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_idempotency_user_key" ON "idempotency_keys" ("user_id", "key") `,
    );
    await queryRunner.query(`CREATE INDEX "ix_idempotency_created" ON "idempotency_keys" ("created_at") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."ix_idempotency_created"`);
    await queryRunner.query(`DROP INDEX "public"."ux_idempotency_user_key"`);
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
  }
}
