#!/usr/bin/env bash
# ========================================
# Deploy AI Visa Interview to HK server
# Usage: npm run deploy
# ========================================
set -euo pipefail

# ── configure these ──────────────────────────────────────
SERVER="ubuntu@124.156.141.221"
SSH_KEY="/c/aivisainterview.pem"
REMOTE_DIR="/home/ubuntu/visa-interview"
# ──────────────────────────────────────────────────────────

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"
PACKAGE="deploy-$(date +%Y%m%d-%H%M%S).tar.gz"

echo "=== Building frontend ==="
npm run build

echo "=== Creating deployment package ==="
tar czf "/tmp/$PACKAGE" \
  dist/ \
  server/ \
  scripts/inviteAdmin.mjs \
  package.json \
  package-lock.json \
  ecosystem.config.cjs

echo "=== Uploading to $SERVER ==="
scp $SSH_OPTS "/tmp/$PACKAGE" "$SERVER:/tmp/$PACKAGE"

echo "=== Deploying on server ==="
ssh $SSH_OPTS "$SERVER" << ENDSSH
  set -e

  # Create remote dir if first deploy
  mkdir -p $REMOTE_DIR/logs $REMOTE_DIR/data

  cd $REMOTE_DIR

  # Extract
  tar xzf "/tmp/$PACKAGE" --overwrite
  rm -f "/tmp/$PACKAGE"

  # Check for .env
  if [ ! -f "$REMOTE_DIR/.env.production" ]; then
    echo ""
    echo "⚠️  WARNING: .env.production not found!"
    echo "   Copy .env.production.example to .env.production and fill in your API keys."
    echo "   Then run: pm2 reload ecosystem.config.cjs"
    echo ""
  fi

  # Install production deps
  npm ci --omit=dev

  # Restart PM2
  if pm2 list | grep -q visa-interview; then
    pm2 reload ecosystem.config.cjs
  else
    pm2 start ecosystem.config.cjs
  fi

  pm2 save

  echo ""
  echo "=== ✅ Deploy complete ==="
  echo "    Check status: pm2 status"
  echo "    Check logs:   pm2 logs visa-interview"
ENDSSH

rm -f "/tmp/$PACKAGE"
echo "=== Done ==="
