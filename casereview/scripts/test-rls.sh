#!/usr/bin/env bash
# Runs the migration + row-level security tests against a THROWAWAY PostgreSQL database.
# Usage: DATABASE_URL=postgres://postgres@localhost:5432/rls_test ./scripts/test-rls.sh
# Never point this at a real Supabase project: it creates stub auth/storage schemas.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to an empty throwaway database}"
cd "$(dirname "$0")/../supabase/tests"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase_stubs.sql -f ../migrations/20261113000000_initial_schema.sql -f rls_test.sql
