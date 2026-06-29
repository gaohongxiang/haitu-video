#!/usr/bin/env bash
set -euo pipefail

BRANCH="${HAITU_DEPLOY_BRANCH:-main}"
REMOTE="${HAITU_DEPLOY_REMOTE:-origin}"
SERVICE="${HAITU_DEPLOY_SERVICE:-haitu-video}"
APP_USER="${HAITU_DEPLOY_USER:-haitu}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
ENV_FILE="${HAITU_DEPLOY_ENV_FILE:-/etc/haitu-video.env}"
HEALTH_URL="http://127.0.0.1:${HAITU_PORT:-4173}/api/health"
PUBLIC_BASE_URL="${HAITU_PUBLIC_BASE_URL:-${BETTER_AUTH_URL:-https://haitu.online}}"

cd "$(dirname "$0")/../.."

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
  HEALTH_URL="http://127.0.0.1:${HAITU_PORT:-4173}/api/health"
  PUBLIC_BASE_URL="${HAITU_PUBLIC_BASE_URL:-${BETTER_AUTH_URL:-https://haitu.online}}"
fi

run_app() {
  if [ "$(id -u)" -eq 0 ]; then
    sudo -u "$APP_USER" HOME="$APP_HOME" "$@"
  else
    "$@"
  fi
}

run_app_env() {
  if [ "$(id -u)" -eq 0 ]; then
    sudo -u "$APP_USER" \
      HOME="$APP_HOME" \
      HAITU_HOST="${HAITU_HOST:-}" \
      HAITU_PORT="${HAITU_PORT:-}" \
      HAITU_DATA_DIR="${HAITU_DATA_DIR:-}" \
      HAITU_DB_PATH="${HAITU_DB_PATH:-}" \
      HAITU_SECRET_KEY="${HAITU_SECRET_KEY:-}" \
      HAITU_ADMIN_EMAIL="${HAITU_ADMIN_EMAIL:-}" \
      HAITU_PUBLIC_BASE_URL="${HAITU_PUBLIC_BASE_URL:-}" \
      BETTER_AUTH_URL="${BETTER_AUTH_URL:-}" \
      HAITU_AUTH_EMAIL_FROM="${HAITU_AUTH_EMAIL_FROM:-}" \
      RESEND_API_KEY="${RESEND_API_KEY:-}" \
      SEEDANCE_RESOLUTION="${SEEDANCE_RESOLUTION:-}" \
      SEEDANCE_WATERMARK="${SEEDANCE_WATERMARK:-}" \
      "$@"
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
run_app_env npm run db:migrate

echo "==> Verifying and building"
run_app npm run deploy:check

echo "==> Restarting ${SERVICE}"
sudo systemctl restart "$SERVICE"

echo "==> Waiting for health check"
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL"; then
    echo
    echo "==> Running public SEO/GEO check against ${PUBLIC_BASE_URL}"
    run_app_env npm run seo:check -- --base "$PUBLIC_BASE_URL"
    echo "==> Deployment complete"
    exit 0
  fi
  sleep 1
done

echo "Health check failed: ${HEALTH_URL}" >&2
systemctl status "$SERVICE" --no-pager >&2 || true
exit 1
