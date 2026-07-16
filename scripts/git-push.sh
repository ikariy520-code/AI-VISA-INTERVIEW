#!/usr/bin/env bash
# Quick git add + commit + push
# Usage: bash scripts/git-push.sh "commit message"
set -euo pipefail

MSG="${1:-update}"

cd "$(dirname "$0")/.."
git add -A
git commit -m "$MSG" || echo "(nothing to commit, pushing anyway)"
git push origin main
echo "=== done ==="
