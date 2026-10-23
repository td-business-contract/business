#!/usr/bin/env bash
# Collaudo locale su database pulito: ricrea il database, avvia il server, esegue test/api-test.mjs, ferma il server.
# Prerequisiti: PostgreSQL raggiungibile (PGHOST/PGUSER o DATABASE_URL), LibreOffice (soffice) per i PDF, dipendenze installate (npm install).
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-postgres}"
DB="${TEST_DB:-business_test}"
export DATABASE_URL="postgres://${PGUSER}@${PGHOST}:5432/${DB}"
export SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@test.local}" SEED_ADMIN_NAME="Amministratore Test" SEED_ADMIN_PASSWORD="Password-Temporanea-1"
export PORT="${PORT:-3100}"
export REQUIRE_TOTP_FOR_ADMINS=false SESSION_SECRET=test-secret-only BASE_URL="http://localhost:${PORT}"
psql -q -c "DROP DATABASE IF EXISTS ${DB}" postgres
psql -q -c "CREATE DATABASE ${DB}" postgres
node src/index.js > /tmp/tdb-test-server.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -sf "http://localhost:${PORT}/api/health" >/dev/null 2>&1 && break; sleep 1; done
node test/api-test.mjs "http://localhost:${PORT}"
