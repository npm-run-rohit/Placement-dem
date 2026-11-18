import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793257513571 implements MigrationInterface {
  name = 'InitialSchema1793257513571';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "sahayak_user_id" text NOT NULL, "email" citext NOT NULL, "name" text NOT NULL, "roles" text array NOT NULL DEFAULT '{}', "avatar_url" text, "active" boolean NOT NULL DEFAULT true, "mailbox_address" text, "mailbox_cursor" text, "out_of_office" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4a37496ca6d7334da3f8ab4ae1" ON "users" ("sahayak_user_id") `,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
    await queryRunner.query(
      `CREATE TABLE "placement_tickets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_no" text NOT NULL, "channel" text NOT NULL, "bimasetu_line_ref" text, "client_ref" text, "opportunity_ref" text, "created_by_id" uuid, "owner_id" uuid NOT NULL, "escalated" boolean NOT NULL DEFAULT false, "rm_user_id" uuid, "rm_name" text NOT NULL, "rm_email" text, "business_name" text NOT NULL, "industry_type" text NOT NULL, "product_type" text NOT NULL, "product_type_raw" text, "business_type" text NOT NULL, "business_type_at_intake" text NOT NULL, "renewal_date" date, "incumbent_insurer_id" uuid, "incumbent_insurer_text" text, "client_spoc" text, "urgency" text NOT NULL DEFAULT 'Medium', "target_premium" numeric(14,2), "note_to_placement" text, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, "risk_tier" text, "stage" text NOT NULL, "internal_status" text NOT NULL, "rm_status" text NOT NULL, "active_rfq_version" integer NOT NULL DEFAULT '1', "panel_locked" boolean NOT NULL DEFAULT false, "thread_seq" integer NOT NULL DEFAULT '0', "qcr_round" integer NOT NULL DEFAULT '1', "mandate_request_seq" integer NOT NULL DEFAULT '0', "follow_ups_stopped" boolean NOT NULL DEFAULT false, "sla_id" text, "sla_owner_type" text, "sla_anchor_at" TIMESTAMP WITH TIME ZONE, "sla_target_mins" integer, "sla_due_at" TIMESTAMP WITH TIME ZONE, "p1_armed_at" TIMESTAMP WITH TIME ZONE, "p1_reminders_sent" integer NOT NULL DEFAULT '0', "p1_escalated_at" TIMESTAMP WITH TIME ZONE, "outcome_type" text, "outcome" jsonb, "closed_at" TIMESTAMP WITH TIME ZONE, "float_payload" jsonb, "previous_ticket_id" uuid, CONSTRAINT "PK_f635e02c8054328175979056c48" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c595dcbcc37d8f7e847d0ed392" ON "placement_tickets" ("ticket_no") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_accc819c4dd0ade985e6ea394d" ON "placement_tickets" ("bimasetu_line_ref") WHERE bimasetu_line_ref IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "ix_ticket_sla_due" ON "placement_tickets" ("sla_due_at") `);
    await queryRunner.query(
      `CREATE INDEX "ix_ticket_stage_owner" ON "placement_tickets" ("stage", "owner_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "thread_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "thread_id" uuid NOT NULL, "kind" text NOT NULL, "actor_type" text NOT NULL, "actor_id" text, "text" text NOT NULL, "mail_message_id" uuid, "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_dfc179cc7020eaf23f075d2a0a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_thread_event_thread_at" ON "thread_events" ("thread_id", "at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "thread_clarifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "thread_id" uuid NOT NULL, "question" text NOT NULL, "asked_at" TIMESTAMP WITH TIME ZONE NOT NULL, "source_mail_id" uuid, "rm_requested_at" TIMESTAMP WITH TIME ZONE, "rm_request_text" text, "rm_response" text, "rm_responded_at" TIMESTAMP WITH TIME ZONE, "reply_text" text, "replied_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_fd9145af8e64719dd58f2ceb497" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "panel_selections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_id" uuid NOT NULL, "rfq_version" integer NOT NULL, "insurer_id" uuid NOT NULL, "branch_id" uuid NOT NULL, "selected_by_id" uuid NOT NULL, "selected_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4186e80852c3f377bb634c97382" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_panel_ticket_entity" ON "panel_selections" ("ticket_id", "rfq_version", "insurer_id", "branch_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "insurer_threads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "thread_ref" text NOT NULL, "rfq_version" integer NOT NULL, "insurer_id" uuid NOT NULL, "branch_id" uuid NOT NULL, "pocs" jsonb NOT NULL, "cc_emails" text array NOT NULL DEFAULT '{}', "status" text NOT NULL DEFAULT 'rfq_sent', "added_after_float" boolean NOT NULL DEFAULT false, "floated_at" TIMESTAMP WITH TIME ZONE, "target_mins" integer NOT NULL, "held_mins" integer NOT NULL DEFAULT '0', "paused_since" TIMESTAMP WITH TIME ZONE, "pause_reason" text, "follow_ups_sent" integer NOT NULL DEFAULT '0', "follow_ups_active" boolean NOT NULL DEFAULT true, "decline_reason" text, "mail_thread_id" text, "last_event_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_c011783424f9ee30329debddc61" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_thread_ticket_ref" ON "insurer_threads" ("ticket_id", "thread_ref") `,
    );
    await queryRunner.query(
      `CREATE TABLE "call_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "thread_id" uuid NOT NULL, "outcome" text NOT NULL, "notes" text, "next_follow_up_at" TIMESTAMP WITH TIME ZONE, "logged_by_id" uuid NOT NULL, "logged_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_aa08476bcc13bfdf394261761e9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "thread_id" uuid, "kind" text NOT NULL, "label" text NOT NULL, "assignee_id" uuid NOT NULL, "due_at" TIMESTAMP WITH TIME ZONE, "status" text NOT NULL DEFAULT 'open', "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_task_assignee_status" ON "tasks" ("assignee_id", "status") `);
    await queryRunner.query(
      `CREATE TABLE "sla_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_id" uuid NOT NULL, "thread_id" uuid, "sla_id" text NOT NULL, "kind" text NOT NULL, "data" jsonb NOT NULL DEFAULT '{}', "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fe6fa8c1019607ffdf8d79a65ee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_sla_event_ticket" ON "sla_events" ("ticket_id", "at") `);
    await queryRunner.query(
      `CREATE TABLE "rfq_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "version" integer NOT NULL, "status" text NOT NULL DEFAULT 'in_review', "excel_document_id" uuid, "link_url" text, "rendered_view_url" text, "change_note" text, "created_by_id" uuid, "validated_at" TIMESTAMP WITH TIME ZONE, "validated_by_id" uuid, "floated_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5240ebafdf05e5944b23ded180e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_rfq_ticket_version" ON "rfq_versions" ("ticket_id", "version") `,
    );
    await queryRunner.query(
      `CREATE TABLE "rfq_queries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "rfq_version_id" uuid NOT NULL, "ref" text NOT NULL, "label" text NOT NULL, "raised_by_id" uuid NOT NULL, "raised_at" TIMESTAMP WITH TIME ZONE NOT NULL, "send_count" integer NOT NULL DEFAULT '1', "answer" text, "answered_at" TIMESTAMP WITH TIME ZONE, "answered_by" text, "resolved" boolean NOT NULL DEFAULT false, "resolved_at" TIMESTAMP WITH TIME ZONE, "resolved_by_id" uuid, CONSTRAINT "PK_f57f818109a1af4c2c907e9d6ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_query_ticket_rfq" ON "rfq_queries" ("ticket_id", "rfq_version_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "quotes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "thread_id" uuid NOT NULL, "insurer_id" uuid NOT NULL, "rfq_version" integer NOT NULL, "version" integer NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, "document_id" uuid NOT NULL, "source_mail_id" uuid, "content_hash" text, "decision" text, "decision_note" text, "decided_at" TIMESTAMP WITH TIME ZONE, "decided_by_id" uuid, "premium" numeric(14,2), "superseded_by_quote_id" uuid, "clarification_text" text, CONSTRAINT "PK_99a0e8bcbcd8719d3a41f23c263" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_quote_ticket_rfq" ON "quotes" ("ticket_id", "rfq_version") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_quote_thread_version" ON "quotes" ("thread_id", "version") `,
    );
    await queryRunner.query(
      `CREATE TABLE "qcr_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "version" integer NOT NULL, "rfq_version" integer NOT NULL, "round" integer NOT NULL, "status" text NOT NULL DEFAULT 'draft', "source" text NOT NULL, "quote_ids" uuid array NOT NULL DEFAULT '{}', "early_release_reason" text, "early_release_count" integer, "document_id" uuid, "copycat_result" jsonb, "current_copycat_request_id" text, "rows_checked" boolean NOT NULL DEFAULT false, "released_at" TIMESTAMP WITH TIME ZONE, "released_by_id" uuid, "sent_to" text, "cover_note" text, "objection" jsonb, CONSTRAINT "PK_1d253c2d85e8b3a8db612006ad9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_qcr_ticket_version" ON "qcr_versions" ("ticket_id", "version") `,
    );
    await queryRunner.query(
      `CREATE TABLE "qcr_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "qcr_id" uuid NOT NULL, "quote_id" uuid NOT NULL, "insurer_id" uuid NOT NULL, "insurer_name" text NOT NULL, "premium" numeric(14,2), "sum_insured" text, "validity_date" date, "terms_note" text, CONSTRAINT "PK_6d4896cbe58b19e72986b77cb64" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "ux_qcr_row_quote" ON "qcr_rows" ("qcr_id", "quote_id") `);
    await queryRunner.query(
      `CREATE TABLE "copycat_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "qcr_id" uuid NOT NULL, "request_id" text NOT NULL, "attempt" integer NOT NULL, "status" text NOT NULL DEFAULT 'queued', "documents" jsonb NOT NULL, "queued_at" TIMESTAMP WITH TIME ZONE NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE, "finished_at" TIMESTAMP WITH TIME ZONE, "error" text, "result_document_id" uuid, "result" jsonb, CONSTRAINT "PK_5e8ba17540d6b963e9108c450ff" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_07e4ef9b9e6a459553b9ec9ee6" ON "copycat_requests" ("request_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "recipient_user_id" uuid NOT NULL, "ticket_id" uuid, "channel" text NOT NULL, "template_id" text NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "status" text NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notification_recipient" ON "notifications" ("recipient_user_id", "read_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sla_definitions" ("id" text NOT NULL, "touchpoint" text NOT NULL, "owner" text NOT NULL, "target_mins" integer NOT NULL, "owner_type" text NOT NULL, "target_text" text NOT NULL, "active" boolean NOT NULL DEFAULT true, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4333cf4ba0402c2ac02aae1f41e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "quote_target_matrix" ("timing_lob" text NOT NULL, "scenario" text NOT NULL, "business_days" numeric(4,1) NOT NULL, CONSTRAINT "PK_a771f2cf70962d9ec5c88720b12" PRIMARY KEY ("timing_lob", "scenario"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_types" ("code" text NOT NULL, "product_group" text NOT NULL, "short_label" text NOT NULL, "label" text NOT NULL, "rfq_template" text NOT NULL, "timing_lob" text NOT NULL, "aliases" text array NOT NULL DEFAULT '{}', "bimasetu_codes" text array NOT NULL DEFAULT '{}', "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_454788983c5156af46697d1931a" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "lookup_values" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" text NOT NULL, "value" text NOT NULL, "description" text, "meta" jsonb NOT NULL DEFAULT '{}', "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_160512210009d6ef3072c1373de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_lookup_kind_value" ON "lookup_values" ("kind", "value") `,
    );
    await queryRunner.query(
      `CREATE TABLE "holidays" ("date" date NOT NULL, "name" text NOT NULL, CONSTRAINT "PK_40dfddee0c0d7125c767d8962b1" PRIMARY KEY ("date"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "communication_templates" ("id" text NOT NULL, "audience" text NOT NULL, "trigger" text NOT NULL, "subject_template" text NOT NULL, "body_template" text NOT NULL, "cc_rule" jsonb NOT NULL DEFAULT '{}', "channels" text array NOT NULL DEFAULT '{}', "active" boolean NOT NULL DEFAULT true, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ca5cd6c5ee3127e345e9d30a719" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "app_settings" ("key" text NOT NULL, "value" jsonb NOT NULL, "updated_by" uuid, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_975c2db59c65c05fd9c6b63a2ab" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "mandates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "type" text NOT NULL, "reference" text NOT NULL, "preferred_insurer_id" uuid, "note" text, "source" text NOT NULL, "proof_document_id" uuid, "mandate_request_id" uuid, "signed_at" TIMESTAMP WITH TIME ZONE, "recorded_by_id" uuid, CONSTRAINT "PK_08c57882cd87cc778f329700004" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "mandate_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "ref" text NOT NULL, "status" text NOT NULL DEFAULT 'requested', "reason" text NOT NULL, "preferred_insurer_id" uuid, "message" text NOT NULL, "requested_by_id" uuid NOT NULL, "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL, "closed_at" TIMESTAMP WITH TIME ZONE, "events" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_040245c4b67a66dfbc057be029f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_mandate_request_open" ON "mandate_requests" ("ticket_id") WHERE status IN ('requested','considering')`,
    );
    await queryRunner.query(
      `CREATE TABLE "master_change_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "entity_type" text NOT NULL, "entity_id" text NOT NULL, "entity_label" text NOT NULL, "field" text NOT NULL, "before" jsonb, "after" jsonb, "changed_by" uuid NOT NULL, "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_36c2b8a09924c2df2c2388f6ccf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_master_change_entity" ON "master_change_log" ("entity_type", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "insurer_pocs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "branch_id" uuid NOT NULL, "product_group" text NOT NULL, "name" text NOT NULL, "designation" text, "phone" text, "email" text NOT NULL, "cc_emails" text array NOT NULL DEFAULT '{}', "routing" jsonb NOT NULL DEFAULT '{}', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_8bc0a4486022ff15f21f9b2cec7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_poc_branch_group" ON "insurer_pocs" ("branch_id", "product_group") `,
    );
    await queryRunner.query(
      `CREATE TABLE "insurer_branches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "insurer_id" uuid NOT NULL, "name" text NOT NULL DEFAULT '', "city" text, "address" text, "status" text NOT NULL DEFAULT 'Active', CONSTRAINT "PK_c842c4292b13590778b633f6623" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_branch_insurer_name" ON "insurer_branches" ("insurer_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "insurers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "code" text NOT NULL, "name" text NOT NULL, "broking_code" text, "status" text NOT NULL DEFAULT 'Active', "logo_url" text, "sectors" text, "note" text, "appetite" text array NOT NULL DEFAULT '{}', CONSTRAINT "PK_ad69a3874b38360804ae8b1a6bb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2255b66f6b0f096d8719bd20ab" ON "insurers" ("code") `);
    await queryRunner.query(
      `CREATE TABLE "inbound_mails" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "provider_message_id" text NOT NULL, "mailbox" text NOT NULL, "from_address" text NOT NULL, "to_addresses" text array NOT NULL DEFAULT '{}', "subject" text NOT NULL, "body_text" text NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attachment_document_ids" uuid array NOT NULL DEFAULT '{}', "ticket_id" uuid, "thread_id" uuid, "mapping_confidence" real, "mapping_basis" text, "unknown_sender" boolean NOT NULL DEFAULT false, "suggested_ticket_ids" uuid array NOT NULL DEFAULT '{}', "classification" text, "classification_confidence" real, "review_queue" text NOT NULL DEFAULT 'none', "review_reason" text, "review_status" text NOT NULL DEFAULT 'pending', "reviewed_by_id" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "applied_class" text, "processed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2f97d6fb19f5f03dc62f649388e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_96163d1113d16d6f17dae7550e" ON "inbound_mails" ("provider_message_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_inbound_review" ON "inbound_mails" ("review_queue", "review_status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_id" uuid, "kind" text NOT NULL, "visibility" text NOT NULL DEFAULT 'internal', "file_name" text NOT NULL, "content_type" text NOT NULL, "size_bytes" bigint NOT NULL, "storage_key" text NOT NULL, "sha256" text NOT NULL, "scan_status" text NOT NULL DEFAULT 'pending', "uploaded_by" text NOT NULL, "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_document_ticket_kind" ON "documents" ("ticket_id", "kind") `);
    await queryRunner.query(
      `CREATE TABLE "revisions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "row_version" integer NOT NULL, "ticket_id" uuid NOT NULL, "round" integer NOT NULL, "qcr_version" integer NOT NULL, "by" text NOT NULL, "reason" text NOT NULL, "asks" text array NOT NULL, "bimasetu_message_id" text, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, "handled_at" TIMESTAMP WITH TIME ZONE, "handled_by_id" uuid, "handled_via" text, CONSTRAINT "PK_4aa9ee2c71c50508c3c501573c9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_revision_ticket_round" ON "revisions" ("ticket_id", "round") `,
    );
    await queryRunner.query(
      `CREATE TABLE "mail_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_id" uuid NOT NULL, "thread_id" uuid, "direction" text NOT NULL, "template_id" text, "from_address" text NOT NULL, "to_addresses" text array NOT NULL, "cc_addresses" text array NOT NULL DEFAULT '{}', "subject" text NOT NULL, "body_html" text NOT NULL, "attachment_document_ids" uuid array NOT NULL DEFAULT '{}', "rfq_link_in_body" boolean NOT NULL DEFAULT false, "provider_message_id" text, "status" text NOT NULL DEFAULT 'queued', "error" text, "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bd6e76ef3b3d4aff7d0510a509" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_mail_ticket_at" ON "mail_messages" ("ticket_id", "at") `);
    await queryRunner.query(
      `CREATE TABLE "audit_events" ("id" BIGSERIAL NOT NULL, "ticket_id" uuid, "entity_type" text NOT NULL, "entity_id" text NOT NULL, "actor_type" text NOT NULL, "actor_id" text, "actor_name" text NOT NULL, "event" text NOT NULL, "detail" text NOT NULL DEFAULT '', "before" jsonb, "after" jsonb, "correlation_id" text, "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_910f64d901a5c3e9878f0d4a407" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_audit_entity" ON "audit_events" ("entity_type", "entity_id") `);
    await queryRunner.query(`CREATE INDEX "ix_audit_ticket_at" ON "audit_events" ("ticket_id", "at") `);
    await queryRunner.query(
      `CREATE TABLE "bimasetu_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "direction" text NOT NULL, "message_id" text NOT NULL, "type" text NOT NULL, "line_ref" text, "ticket_id" uuid, "payload" jsonb NOT NULL, "status" text NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "last_error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "processed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_3eda427bac28f2f8f707004e986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_bimasetu_ticket" ON "bimasetu_messages" ("ticket_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ux_bimasetu_direction_msg" ON "bimasetu_messages" ("direction", "message_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "destination" text NOT NULL, "event_type" text NOT NULL, "aggregate_type" text NOT NULL, "aggregate_id" uuid NOT NULL, "payload" jsonb NOT NULL, "correlation_id" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT '0', "last_error" text, CONSTRAINT "PK_6689a16c00d09b8089f6237f1d2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_outbox_unpublished" ON "outbox_events" ("published_at", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "placement_tickets" ADD CONSTRAINT "FK_fd03ab0c0202970e53a40aae5b8" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurer_pocs" ADD CONSTRAINT "FK_401055817e2a0ab2d0b14134aa7" FOREIGN KEY ("branch_id") REFERENCES "insurer_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "insurer_branches" ADD CONSTRAINT "FK_e72ad086a9e124cad831d3a80cb" FOREIGN KEY ("insurer_id") REFERENCES "insurers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "insurer_branches" DROP CONSTRAINT "FK_e72ad086a9e124cad831d3a80cb"`,
    );
    await queryRunner.query(`ALTER TABLE "insurer_pocs" DROP CONSTRAINT "FK_401055817e2a0ab2d0b14134aa7"`);
    await queryRunner.query(
      `ALTER TABLE "placement_tickets" DROP CONSTRAINT "FK_fd03ab0c0202970e53a40aae5b8"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_outbox_unpublished"`);
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(`DROP INDEX "public"."ux_bimasetu_direction_msg"`);
    await queryRunner.query(`DROP INDEX "public"."ix_bimasetu_ticket"`);
    await queryRunner.query(`DROP TABLE "bimasetu_messages"`);
    await queryRunner.query(`DROP INDEX "public"."ix_audit_ticket_at"`);
    await queryRunner.query(`DROP INDEX "public"."ix_audit_entity"`);
    await queryRunner.query(`DROP TABLE "audit_events"`);
    await queryRunner.query(`DROP INDEX "public"."ix_mail_ticket_at"`);
    await queryRunner.query(`DROP TABLE "mail_messages"`);
    await queryRunner.query(`DROP INDEX "public"."ux_revision_ticket_round"`);
    await queryRunner.query(`DROP TABLE "revisions"`);
    await queryRunner.query(`DROP INDEX "public"."ix_document_ticket_kind"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP INDEX "public"."ix_inbound_review"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_96163d1113d16d6f17dae7550e"`);
    await queryRunner.query(`DROP TABLE "inbound_mails"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2255b66f6b0f096d8719bd20ab"`);
    await queryRunner.query(`DROP TABLE "insurers"`);
    await queryRunner.query(`DROP INDEX "public"."ux_branch_insurer_name"`);
    await queryRunner.query(`DROP TABLE "insurer_branches"`);
    await queryRunner.query(`DROP INDEX "public"."ix_poc_branch_group"`);
    await queryRunner.query(`DROP TABLE "insurer_pocs"`);
    await queryRunner.query(`DROP INDEX "public"."ix_master_change_entity"`);
    await queryRunner.query(`DROP TABLE "master_change_log"`);
    await queryRunner.query(`DROP INDEX "public"."ux_mandate_request_open"`);
    await queryRunner.query(`DROP TABLE "mandate_requests"`);
    await queryRunner.query(`DROP TABLE "mandates"`);
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP TABLE "communication_templates"`);
    await queryRunner.query(`DROP TABLE "holidays"`);
    await queryRunner.query(`DROP INDEX "public"."ux_lookup_kind_value"`);
    await queryRunner.query(`DROP TABLE "lookup_values"`);
    await queryRunner.query(`DROP TABLE "product_types"`);
    await queryRunner.query(`DROP TABLE "quote_target_matrix"`);
    await queryRunner.query(`DROP TABLE "sla_definitions"`);
    await queryRunner.query(`DROP INDEX "public"."ix_notification_recipient"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_07e4ef9b9e6a459553b9ec9ee6"`);
    await queryRunner.query(`DROP TABLE "copycat_requests"`);
    await queryRunner.query(`DROP INDEX "public"."ux_qcr_row_quote"`);
    await queryRunner.query(`DROP TABLE "qcr_rows"`);
    await queryRunner.query(`DROP INDEX "public"."ux_qcr_ticket_version"`);
    await queryRunner.query(`DROP TABLE "qcr_versions"`);
    await queryRunner.query(`DROP INDEX "public"."ux_quote_thread_version"`);
    await queryRunner.query(`DROP INDEX "public"."ix_quote_ticket_rfq"`);
    await queryRunner.query(`DROP TABLE "quotes"`);
    await queryRunner.query(`DROP INDEX "public"."ix_query_ticket_rfq"`);
    await queryRunner.query(`DROP TABLE "rfq_queries"`);
    await queryRunner.query(`DROP INDEX "public"."ux_rfq_ticket_version"`);
    await queryRunner.query(`DROP TABLE "rfq_versions"`);
    await queryRunner.query(`DROP INDEX "public"."ix_sla_event_ticket"`);
    await queryRunner.query(`DROP TABLE "sla_events"`);
    await queryRunner.query(`DROP INDEX "public"."ix_task_assignee_status"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(`DROP TABLE "call_logs"`);
    await queryRunner.query(`DROP INDEX "public"."ux_thread_ticket_ref"`);
    await queryRunner.query(`DROP TABLE "insurer_threads"`);
    await queryRunner.query(`DROP INDEX "public"."ux_panel_ticket_entity"`);
    await queryRunner.query(`DROP TABLE "panel_selections"`);
    await queryRunner.query(`DROP TABLE "thread_clarifications"`);
    await queryRunner.query(`DROP INDEX "public"."ix_thread_event_thread_at"`);
    await queryRunner.query(`DROP TABLE "thread_events"`);
    await queryRunner.query(`DROP INDEX "public"."ix_ticket_stage_owner"`);
    await queryRunner.query(`DROP INDEX "public"."ix_ticket_sla_due"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_accc819c4dd0ade985e6ea394d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c595dcbcc37d8f7e847d0ed392"`);
    await queryRunner.query(`DROP TABLE "placement_tickets"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4a37496ca6d7334da3f8ab4ae1"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
