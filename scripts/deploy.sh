#!/usr/bin/env bash
# Deploy to an explicitly selected Linux server.
# Required: DEPLOY_HOST. Optional: DEPLOY_SSH_KEY, DEPLOY_REMOTE_DIR.
set -euo pipefail

: "${DEPLOY_HOST:?Set DEPLOY_HOST, for example ubuntu@example.com}"
DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/home/ubuntu/ai-visa-interview}"

if [[ ! "$DEPLOY_REMOTE_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "DEPLOY_REMOTE_DIR must be an absolute path containing only letters, numbers, dot, underscore, dash and slash." >&2
  exit 2
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$DEPLOY_SSH_KEY")
fi

PACKAGE_PATH="$(mktemp "${TMPDIR:-/tmp}/ai-visa-deploy.XXXXXX.tar.gz")"
PACKAGE_NAME="$(basename "$PACKAGE_PATH")"
trap 'rm -f "$PACKAGE_PATH"' EXIT

echo "=== Building and testing ==="
npm test
npm run build

echo "=== Creating deployment package ==="
tar czf "$PACKAGE_PATH" \
  dist/ \
  server/ \
  scripts/finalReportSmoke.mjs \
  .env.production.example \
  LICENSE \
  NOTICE \
  package.json \
  package-lock.json \
  ecosystem.config.cjs

echo "=== Uploading to $DEPLOY_HOST ==="
scp "${SSH_OPTS[@]}" "$PACKAGE_PATH" "$DEPLOY_HOST:/tmp/$PACKAGE_NAME"

echo "=== Deploying on server ==="
ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" bash -s -- "$DEPLOY_REMOTE_DIR" "$PACKAGE_NAME" << 'ENDSSH'
  set -euo pipefail
  REMOTE_DIR="$1"
  PACKAGE_NAME="$2"

  mkdir -p "$REMOTE_DIR/logs"
  cd "$REMOTE_DIR"

  tar xzf "/tmp/$PACKAGE_NAME" --overwrite
  rm -f "/tmp/$PACKAGE_NAME"

  if [ ! -f .env.production ]; then
    echo ""
    echo "WARNING: .env.production was not found."
    echo "Create it from .env.production.example, set mode 600, then reload PM2."
    echo ""
  fi

  npm ci --omit=dev

  if pm2 list | grep -q visa-interview; then
    pm2 reload ecosystem.config.cjs
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save
  pm2 status
ENDSSH

echo "=== Deployment complete ==="
