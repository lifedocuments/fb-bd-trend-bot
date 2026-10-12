#!/usr/bin/env bash
# Saves data/ (and reports/) back to the repo. If another run pushed in the
# meantime, merges both versions instead of failing (up to 4 tries).
# Usage: bash scripts/save-data.sh "commit message"
set -u
MSG="${1:-Update bot data [skip ci]}"
git config user.name "fb-bd-trend-bot"
git config user.email "actions@users.noreply.github.com"
BRANCH="${GITHUB_REF_NAME:-main}"

stage() { git add -A data/ 2>/dev/null; [ -d reports ] && git add -A reports/ 2>/dev/null; true; }

stage
if git diff --cached --quiet; then echo "Nothing new to save."; exit 0; fi
git commit -q -m "$MSG"

for attempt in 1 2 3 4; do
  if git push -q origin "HEAD:$BRANCH"; then echo "Saved (attempt $attempt)."; exit 0; fi
  echo "Someone else saved first — merging both versions (attempt $attempt)..."
  TMP="$(mktemp -d)"
  cp -r data "$TMP/data"
  [ -d reports ] && cp -r reports "$TMP/reports"
  git fetch -q origin "$BRANCH"
  git reset -q --hard "origin/$BRANCH"
  node scripts/merge-data.js "$TMP/data" data || exit 1
  [ -d "$TMP/reports" ] && mkdir -p reports && cp -r "$TMP/reports/." reports/
  stage
  if git diff --cached --quiet; then echo "Nothing new after merge."; exit 0; fi
  git commit -q -m "$MSG"
  sleep $((attempt * 3))
done
echo "Could not save after 4 tries."
exit 1
