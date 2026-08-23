#!/usr/bin/env bash
set -euo pipefail

# Renews the Let's Encrypt certificate and reloads nginx to pick it up.
# For initial cert issuance (a one-time manual step) and cron setup, see
# nginx/certs/README.md — this script only handles ongoing renewal.

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.prod.yml}"

echo "[certbot] Attempting renewal..."
docker compose -f "$COMPOSE_FILE" run --rm certbot renew --webroot -w /var/www/certbot

echo "[certbot] Syncing renewed certificate into nginx/certs/ ..."
found_domain=false
for domain_dir in "$REPO_ROOT"/nginx/certbot-letsencrypt/live/*/; do
  [ -d "$domain_dir" ] || continue
  found_domain=true
  cp "${domain_dir}fullchain.pem" "$REPO_ROOT/nginx/certs/fullchain.pem"
  cp "${domain_dir}privkey.pem" "$REPO_ROOT/nginx/certs/privkey.pem"
done

if [ "$found_domain" = false ]; then
  echo "[certbot] ERROR: no certificate found under nginx/certbot-letsencrypt/live/ — has the initial issuance step (see nginx/certs/README.md) been run yet?" >&2
  exit 1
fi

echo "[certbot] Reloading nginx..."
docker compose -f "$COMPOSE_FILE" exec proxy nginx -s reload

echo "[certbot] Done."
