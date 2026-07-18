#!/usr/bin/env bash
# Reads .env.local and uploads every key to Vercel (production + preview +
# development) so you don't have to add them one by one in the dashboard.
#
# Usage:
#   vercel link        # once, to connect this folder to your Vercel project
#   bash push-env-to-vercel.sh
#   vercel --prod      # redeploy so the new env vars take effect
set -uo pipefail

ENV_FILE="${1:-.env.local}"
ENVIRONMENTS=("production" "preview" "development")

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found. Run this from the project folder."
  exit 1
fi

echo "Uploading variables from $ENV_FILE to Vercel…"
while IFS= read -r line || [ -n "$line" ]; do
  # skip blank lines and comments
  [ -z "${line//[[:space:]]/}" ] && continue
  case "$line" in \#*) continue ;; esac
  case "$line" in *"="*) ;; *) continue ;; esac

  key="${line%%=*}"
  val="${line#*=}"
  key="$(printf '%s' "$key" | tr -d '[:space:]')"
  # strip optional surrounding quotes
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  [ -z "$key" ] && continue

  for envn in "${ENVIRONMENTS[@]}"; do
    vercel env rm "$key" "$envn" -y >/dev/null 2>&1
    if printf '%s' "$val" | vercel env add "$key" "$envn" >/dev/null 2>&1; then
      echo "  ✅ $key ($envn)"
    else
      echo "  ⚠️  $key ($envn) failed"
    fi
  done
done < "$ENV_FILE"

echo ""
echo "Done ✅  Now run:  vercel --prod"
