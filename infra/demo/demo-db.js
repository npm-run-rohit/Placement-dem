// QA demo database helper for start.sh. Every start (and every "Reset demo data") loads into a NEW database
// on the Neon server, then drops the older ones. Render runs the old and new instance side by side during a
// deploy, so the two must never share a database: the old one keeps serving its own data until Render stops it.
//   node demo-db.js create <name>   create database <name>; print its connection URL
//   node demo-db.js prune <name>    drop the demo_* databases older than <name> (FORCE: ends their sessions)
// The base DATABASE_URL (Render env) only serves as the connection to the server.
const { Client } = require('pg');

const [mode, name] = process.argv.slice(2);
if (!/^demo_[a-z0-9_]+$/.test(name || '')) {
  console.error(`demo-db: bad database name ${name}`);
  process.exit(1);
}
const base = process.env.DEMO_BASE_DATABASE_URL || process.env.DATABASE_URL;
const c = new Client({ connectionString: base });

async function main() {
  await c.connect();
  if (mode === 'create') {
    await c.query(`CREATE DATABASE "${name}"`);
    const u = new URL(base);
    u.pathname = `/${name}`;
    process.stdout.write(u.toString());
  } else if (mode === 'prune') {
    // only OLDER ones: an older instance pruning late must never drop a newer instance's database
    const age = (n) => Number(n.slice('demo_'.length)) || 0;
    const r = await c.query(`SELECT datname FROM pg_database WHERE datname LIKE 'demo\\_%'`);
    for (const { datname } of r.rows.filter((d) => age(d.datname) < age(name))) {
      await c.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
      console.error(`demo-db: dropped ${datname}`);
    }
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
}

main()
  .catch((e) => {
    console.error(`demo-db ${mode}: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => c.end().catch(() => {}));
