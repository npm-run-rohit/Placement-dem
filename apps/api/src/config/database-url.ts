import { readFileSync } from 'node:fs';

const LOCAL_URL = 'postgres://placement:placement@localhost:5432/placement';

/**
 * The Postgres connection string. DATABASE_URL wins (local, CI); on ECS the RDS secret arrives as separate
 * DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD keys plus a plain DB_DATABASE, so the URL is built from them.
 * Shared by the app config and the TypeORM CLI data source (migrations).
 */
export function databaseUrl(e: NodeJS.ProcessEnv): string {
  if (e.DATABASE_URL) return e.DATABASE_URL;
  if (!e.DB_HOST) return LOCAL_URL;
  const user = encodeURIComponent(e.DB_USERNAME ?? '');
  const password = encodeURIComponent(e.DB_PASSWORD ?? '');
  return `postgres://${user}:${password}@${e.DB_HOST}:${e.DB_PORT ?? '5432'}/${e.DB_DATABASE ?? 'placement'}`;
}

/** TLS to RDS (rds.force_ssl), verified against the CA bundle baked into the image; off when no bundle is set. */
export function databaseSsl(caPath: string | undefined): { ca: string } | undefined {
  return caPath ? { ca: readFileSync(caPath, 'utf8') } : undefined;
}
