#!/bin/sh
# Starts the QA demo container: Redis, Mailpit, a fresh database (migrated, seeded, fixtures), API, worker, Caddy.
# Every start (Render wakes the free instance on the first visit after 15 idle minutes, and on each deploy)
# begins from clean demo data. "Reset demo data" in the dev tools menu does the same while running: the API
# writes $DEMO_RESET_FILE and the loop at the bottom restarts API + worker on a fresh database.
# Each load goes into its own new database (demo-db.js), so an older instance still running during a deploy
# never shares one with this instance; older demo databases are dropped once this one is serving.
set -e
: "${DATABASE_URL:?DATABASE_URL is required (Neon connection string)}"
: "${DEMO_USER:?DEMO_USER is required}"
: "${DEMO_PASS_HASH:?DEMO_PASS_HASH (bcrypt) is required}"
export DEMO_BASE_DATABASE_URL="$DATABASE_URL"
export DEMO_RESET_FILE=/tmp/demo-reset
rm -f "$DEMO_RESET_FILE"

# queue only; nothing to keep across restarts. noeviction as BullMQ requires
redis-server --bind 127.0.0.1 --save '' --appendonly no --maxmemory 48mb --maxmemory-policy noeviction --daemonize yes

mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 --webroot /mailpit/ --max 1000 --quiet &

fresh_data() {
  DB_NAME="demo_$(date +%s)"
  echo "Demo: loading fresh data into $DB_NAME"
  NEW_URL=$(node demo-db.js create "$DB_NAME") || return 1
  redis-cli flushall > /dev/null
  node -e "fetch('http://127.0.0.1:8025/mailpit/api/v1/messages', { method: 'DELETE' }).catch(() => {})"
  DATABASE_URL="$NEW_URL" npm run db:deploy || return 1
  DATABASE_URL="$NEW_URL" node dist/database/seeds/seed-fixtures.js || return 1
  export DATABASE_URL="$NEW_URL" # only once it is complete; a failed reset keeps serving the previous one
  SERVING_DB="$DB_NAME"
  echo "$DB_NAME" > /tmp/demo-serving-db
}

start_apps() {
  PORT=4000 node --max-old-space-size=160 dist/main.js &
  API_PID=$!
  node --max-old-space-size=160 dist/worker.js &
  WORKER_PID=$!
}

fresh_data
start_apps

# Render sets PORT for the public listener (Caddy); the API stays on 4000 behind it
CADDY_PORT="${PORT:-10000}" caddy run --config /app/Caddyfile --adapter caddyfile &
CADDY_PID=$!

set +e
# drop the older demo databases once Render has had time to switch traffic to this instance
(sleep 120 && node demo-db.js prune "$(cat /tmp/demo-serving-db)") &

while kill -0 "$CADDY_PID" 2>/dev/null; do
  if [ -f "$DEMO_RESET_FILE" ]; then
    rm -f "$DEMO_RESET_FILE"
    sleep 1 # let the API answer the reset request
    kill "$API_PID" "$WORKER_PID" 2>/dev/null
    wait "$API_PID" "$WORKER_PID" 2>/dev/null
    if fresh_data; then
      echo "Demo: reset done"
      node demo-db.js prune "$SERVING_DB"
    else
      echo "Demo: reset FAILED"
    fi
    start_apps
  fi
  sleep 2
done
wait "$CADDY_PID"
