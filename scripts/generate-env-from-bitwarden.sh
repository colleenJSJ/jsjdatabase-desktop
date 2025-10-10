#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="142a0a51-1b17-4f0c-9bd5-b37200f003dd"
DEFAULT_TARGET="local"
CHOICE=${1:-$DEFAULT_TARGET}

case "$CHOICE" in
  local)
    TARGETS=(".env.local")
    ;;
  production)
    TARGETS=(".env.production.local")
    ;;
  both|all)
    TARGETS=(".env.local" ".env.production.local")
    ;;
  *)
    cat <<USAGE
Usage: ./scripts/generate-env-from-bitwarden.sh [local|production|both]
  local       Generate .env.local (default)
  production  Generate .env.production.local
  both        Generate both files

Requires BWS_ACCESS_TOKEN to be set for the Bitwarden CLI.
USAGE
    exit 1
    ;;
esac

if ! command -v bws >/dev/null 2>&1; then
  echo "bws CLI is not available in PATH" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to parse Bitwarden output" >&2
  exit 1
fi

if [ -z "${BWS_ACCESS_TOKEN:-}" ]; then
  echo "BWS_ACCESS_TOKEN is not set. Export the machine account token first." >&2
  exit 1
fi

echo "Fetching secrets from Bitwarden project $PROJECT_ID..."
BW_SECRETS_JSON=$(bws secret list "$PROJECT_ID" --output json)

get_secret() {
  local key="$1"
  echo "$BW_SECRETS_JSON" | jq -r ".[] | select(.key==\"${key}\") | .value"
}

update_key_in_file() {
  local file="$1"
  local key="$2"
  local value="$3"

# Prefer python3 but fall back to python if available
  PYTHON_BIN="python3"
  command -v python3 >/dev/null 2>&1 || PYTHON_BIN="python"
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "    ❌ Python is required to update $key in $file" >&2
    return 1
  fi

  "$PYTHON_BIN" - "$file" "$key" "$value" <<'PY'
import sys
path, key, value = sys.argv[1:4]
updated = False
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
for idx, line in enumerate(lines):
    if line.startswith(f"{key}="):
        lines[idx] = f"{key}={value}\n"
        updated = True
        break
if not updated:
    lines.append(f"{key}={value}\n")
with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
PY
}

SECRETS=(
  SUPABASE_SERVICE_ROLE_KEY
  EDGE_SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_JWT_SECRET
  EDGE_SERVICE_SECRET
  ENCRYPTION_KEY
  EDGE_ENCRYPTION_KEY
  BACKBLAZE_APPLICATION_KEY
  EDGE_BACKBLAZE_APPLICATION_KEY
  GOOGLE_CLIENT_SECRET
  EDGE_GOOGLE_CLIENT_SECRET
  ANTHROPIC_API_KEY
  EDGE_ANTHROPIC_API_KEY
  ZOOM_CLIENT_SECRET
  EDGE_ZOOM_CLIENT_SECRET
)

for target in "${TARGETS[@]}"; do
  echo "\nGenerating $target..."
  cp .env.example "$target"

  for key in "${SECRETS[@]}"; do
    value=$(get_secret "$key")
    if [ -z "$value" ] || [ "$value" = "null" ]; then
      echo "  ⚠️  Bitwarden secret '$key' not found; leaving placeholder in $target"
      continue
    fi
    update_key_in_file "$target" "$key" "$value"
  done

  echo "  ✔ Wrote $target"
done

echo "\nDone. Remember .env files remain ignored by git."
