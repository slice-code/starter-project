#!/bin/sh
set -e

echo "Admin Starter — starting..."

echo "Waiting for database..."
i=0
while [ "$i" -lt 30 ]; do
  if node -e "
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.connect().then(() => { client.end(); process.exit(0); }).catch(() => process.exit(1));
  " 2>/dev/null; then
    echo "Database ready."
    break
  fi
  i=$((i + 1))
  if [ "$i" -eq 30 ]; then
    echo "Database not ready after 30s"
    exit 1
  fi
  sleep 1
done

if [ "${SEED_ADMIN:-true}" = "true" ]; then
  echo "Admin seed runs on app startup (SEED_ADMIN=true)."
fi

exec node server.js
