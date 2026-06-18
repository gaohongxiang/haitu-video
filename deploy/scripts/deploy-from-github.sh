#!/usr/bin/env bash
set -euo pipefail

BRANCH="${HAITU_DEPLOY_BRANCH:-main}"
REMOTE="${HAITU_DEPLOY_REMOTE:-origin}"
SERVICE="${HAITU_DEPLOY_SERVICE:-haitu-video}"
APP_USER="${HAITU_DEPLOY_USER:-haitu}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
HEALTH_URL="http://127.0.0.1:${HAITU_PORT:-4173}/api/health"

cd "$(dirname "$0")/../.."

run_app() {
  if [ "$(id -u)" -eq 0 ]; then
    sudo -u "$APP_USER" HOME="$APP_HOME" "$@"
  else
    "$@"
  fi
}

echo "==> Fetching ${REMOTE}/${BRANCH}"
run_app git fetch "$REMOTE" "$BRANCH"

echo "==> Resetting working tree to ${REMOTE}/${BRANCH}"
run_app git reset --hard "${REMOTE}/${BRANCH}"
run_app git clean -fd

echo "==> Installing dependencies"
run_app npm ci

echo "==> Migrating database"
run_app npm run db:migrate

echo "==> Verifying and building"
run_app npm run deploy:check

echo "==> Restarting ${SERVICE}"
sudo systemctl restart "$SERVICE"

echo "==> Waiting for health check"
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL"; then
    echo
    echo "==> Deployment complete"
    exit 0
  fi
  sleep 1
done

echo "Health check failed: ${HEALTH_URL}" >&2
systemctl status "$SERVICE" --no-pager >&2 || true
exit 1
