/**
 * Users loaded before they ever log in (masters import) get `pending:<email>` as their Sahayak id; the first
 * login with that email claims the row and replaces it with the real Sahayak subject (UsersService.upsertFromSahayak).
 */
export const PENDING_SAHAYAK_PREFIX = 'pending:';

/** `changed_by` on master_change_log rows written by the masters import (not a real user; shown as "Masters import"). */
export const IMPORT_ACTOR_ID = '00000000-0000-0000-0000-00000000a001';
export const IMPORT_ACTOR_NAME = 'Masters import';
