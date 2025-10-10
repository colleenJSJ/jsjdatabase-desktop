#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: ./scripts/deploy-edge-functions.sh [--skip-dashboard]

Deploys the edge functions that have local source:
  - encryption-service
  - anthropic-proxy
  - zoom-meeting-service

Functions managed only in the dashboard (no local source) must be deployed manually:
  - google-token-service
  - backblaze-signed-url

Requires:
  - supabase CLI installed and authenticated (supabase login)
  - SUPABASE_PROJECT_REF exported if you use multiple projects
HELP
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

for cmd in supabase; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

FUNCTIONS=(
  "encryption-service"
  "anthropic-proxy"
  "zoom-meeting-service"
)

echo "Deploying Supabase edge functions..."
for fn in "${FUNCTIONS[@]}"; do
  echo "  -> $fn"
  supabase functions deploy "$fn"
done

cat <<'REMINDER'

⚠️  Reminder:
  google-token-service and backblaze-signed-url are not present in the local supabase/functions directory.
  Deploy them from the Supabase dashboard (Edge Functions → select function → Deploy) to ensure they pick up updated secrets.

Done.
REMINDER
