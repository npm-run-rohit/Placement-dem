#!/bin/sh
# Starts the QA demo container: Redis, Mailpit, migrations + seed (+ fixtures on an empty DB), API, worker, Caddy.
set -e
: "${DATABASE_URL:?DATABASE_URL is required (Neon connection string)}"
: "${DEMO_USER:?DEMO_USER is required}"
: "${DEMO_PASS_HASH:?DEMO_PASS_HASH (bcrypt) is required}"

# queue only; nothing to keep across restarts. noeviction as BullMQ requires
redis-server --bind 127.0.0.1 --save '' --appendonly no --maxmemory 48mb --maxmemory-policy noeviction --daemonize yes

mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 --webroot /mailpit/ --max 1000 --quiet &

npm run db:deploy

TICKETS=$(node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => c.query('select count(*)::int as n from placement_tickets')).then((r) => { console.log(r.rows[0].n); return c.end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
")
if [ "$TICKETS" = "0" ]; then
  echo "Empty database: loading the demo fixtures"
  node dist/database/seeds/seed-fixtures.js
fi

# Render sets PORT for the public listener (Caddy); the API stays on 4000 behind it
export CADDY_PORT="${PORT:-10000}" PORT=4000
node --max-old-space-size=160 dist/main.js &
node --max-old-space-size=160 dist/worker.js &
exec caddy run --config /app/Caddyfile --adapter caddyfile
