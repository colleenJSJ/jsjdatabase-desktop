#!/usr/bin/env bash
set -euo pipefail

REPO="colleenJSJ/jsjdatabase-desktop"
PROJECT_ID="142a0a51-1b17-4f0c-9bd5-b37200f003dd"

SECRETS=(
  SUPABASE_SERVICE_ROLE_KEY
  EDGE_SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_JWT_SECRET
  EDGE_SERVICE_SECRET
  ENCRYPTION_KEY
  EDGE_ENCRYPTION_KEY
  BACKBLAZE_KEY_ID
  BACKBLAZE_APPLICATION_KEY
  EDGE_BACKBLAZE_KEY_ID
  EDGE_BACKBLAZE_APPLICATION_KEY
  GOOGLE_CLIENT_SECRET
  EDGE_GOOGLE_CLIENT_SECRET
  ANTHROPIC_API_KEY
  EDGE_ANTHROPIC_API_KEY
  ZOOM_CLIENT_SECRET
  EDGE_ZOOM_CLIENT_SECRET
  APPLE_APP_SPECIFIC_PASSWORD
  APPLE_ID
  APPLE_TEAM_ID
  CERTIFICATE_OSX_APPLICATION
  CERTIFICATE_PASSWORD
  KEYCHAIN_PASSWORD
  GH_TOKEN
)

echo "Fetching secrets list from Bitwarden..."
BW_SECRETS_JSON=$(bws secret list "$PROJECT_ID" --output json)

for name in "${SECRETS[@]}"; do
  secret_id=$(echo "$BW_SECRETS_JSON" | jq -r ".[] | select(.key==\"$name\") | .id")
  if [[ -z "$secret_id" || "$secret_id" == "null" ]]; then
    echo "Skipping $name (not found in Bitwarden)"
    continue
  fi

  echo "Syncing $name..."
  value=$(bws secret get "$secret_id" --output json | jq -r '.value')

  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "  Warning: Bitwarden returned empty value for $name"
    continue
  fi

  printf '%s' "$value" | gh secret set "$name" --repo "$REPO" --app actions >/dev/null
done

echo "Done."
