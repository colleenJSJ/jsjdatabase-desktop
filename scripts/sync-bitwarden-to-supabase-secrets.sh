#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: ./scripts/sync-bitwarden-to-supabase-secrets.sh

Requires:
  - bws CLI with BWS_ACCESS_TOKEN set (machine account token)
  - supabase CLI installed and authenticated (supabase login)
  - jq installed
  - Supabase project ref exported as SUPABASE_PROJECT_REF (e.g. xupkvt...)
HELP
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

for cmd in bws jq supabase; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

if [ -z "${BWS_ACCESS_TOKEN:-}" ]; then
  echo "BWS_ACCESS_TOKEN is not set; export your Bitwarden machine-account token first." >&2
  exit 1
fi

if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
  echo "SUPABASE_PROJECT_REF is not set. Export your project ref (e.g. xupkvtszrobsmxeplvhi)." >&2
  exit 1
fi

PROJECT_ID="142a0a51-1b17-4f0c-9bd5-b37200f003dd"

echo "Fetching secrets from Bitwarden project $PROJECT_ID..."
BW_SECRETS_JSON=$(bws secret list "$PROJECT_ID" --output json)

get_secret() {
  local key="$1"
  echo "$BW_SECRETS_JSON" | jq -r ".[] | select(.key==\"${key}\") | .value"
}

declare -a SECRET_KEYS=(
  EDGE_SERVICE_SECRET
  ENCRYPTION_KEY
  EDGE_ENCRYPTION_KEY
  BACKBLAZE_APPLICATION_KEY
  EDGE_BACKBLAZE_APPLICATION_KEY
  EDGE_BACKBLAZE_KEY_ID
  EDGE_BACKBLAZE_BUCKET_ID
  EDGE_BACKBLAZE_BUCKET_NAME
  ANTHROPIC_API_KEY
  EDGE_ANTHROPIC_API_KEY
  GOOGLE_CLIENT_SECRET
  EDGE_GOOGLE_CLIENT_SECRET
  ZOOM_CLIENT_SECRET
  EDGE_ZOOM_CLIENT_SECRET
)

declare -a SUPABASE_SET_ARGS=()

for key in "${SECRET_KEYS[@]}"; do
  value=$(get_secret "$key")
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    echo "  ⚠️  Bitwarden secret '$key' not found; skipping"
    continue
  fi
  SUPABASE_SET_ARGS+=("$key=$value")

done

if [ ${#SUPABASE_SET_ARGS[@]} -eq 0 ]; then
  echo "No secrets resolved; aborting."
  exit 1
fi

echo "Updating Supabase secrets for project $SUPABASE_PROJECT_REF..."
supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" "${SUPABASE_SET_ARGS[@]}"

echo "Supabase project secrets updated. Redeploy edge functions to apply changes."
