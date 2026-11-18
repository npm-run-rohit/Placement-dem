# Migrations

1. `1730000000000-Bootstrap.ts` (hand-written): extensions + `placement_ticket_no_seq`.
2. `1793257513571-InitialSchema.ts` was generated from the entities. For every later entity change generate a new one (requires Postgres up: `npm run db:up` at repo root):

   ```bash
   npm run migration:generate -w @bimaplacement/api --name=InitialSchema
   ```

3. `1793257513572-AuditImmutability.ts` (hand-written, included): append-only triggers:

   ```sql
   CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
   BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
   CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
     FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
   -- same for thread_events, sla_events, master_change_log, mail_messages (status updates excepted -> separate column table if needed)
   ```

Never use `synchronize: true` outside throwaway local databases.
