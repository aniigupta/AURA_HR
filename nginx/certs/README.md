# TLS certificates

Place your production TLS certificate here before starting `docker-compose.prod.yml`:

- `fullchain.pem` — full certificate chain
- `privkey.pem` — private key

These files are gitignored and must never be committed.

Until real certificates are present, the `proxy` service in
`docker-compose.prod.yml` will fail to start — this is intentional, since
serving the app without TLS in production is not acceptable.

## Option A: Let's Encrypt / certbot (recommended, auto-renewing)

A `certbot` service is already defined in `docker-compose.prod.yml`, using
the `/.well-known/acme-challenge/` webroot location already configured in
`nginx/nginx.conf`. It doesn't run continuously — you invoke it directly.

**1. First, edit `nginx/nginx.conf`** and replace `server_name localhost;`
(both server blocks) with your real domain — Let's Encrypt can't issue a
certificate for `localhost`.

**2. Start everything except the proxy** (it won't start without certs yet,
so bring the rest up first — certbot's webroot challenge is served by
whichever container has `nginx/certbot-www` mounted, which for the very
first issuance means running a temporary minimal listener, or simpler: get
the `proxy` service running first with a self-signed placeholder cert, then
swap to the real one — see step 3):

```bash
# Quick self-signed placeholder so nginx will start at all for step 2:
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
  -subj "/CN=localhost"

docker compose -f docker-compose.prod.yml up -d
```

**3. Issue the real certificate** (one-time, replace the domain and email):

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d yourdomain.com \
  --email you@yourdomain.com --agree-tos --non-interactive
```

**4. Sync the issued cert into place and reload nginx:**

```bash
chmod +x nginx/scripts/renew_certs.sh
nginx/scripts/renew_certs.sh
```

**5. Set up auto-renewal via cron** (Let's Encrypt certs expire every 90
days; this checks twice daily, which is certbot's own recommendation —
it only actually renews when the cert is within 30 days of expiry):

```cron
0 3,15 * * * REPO_ROOT=/opt/aurahr /opt/aurahr/nginx/scripts/renew_certs.sh >> /var/log/aurahr-certbot.log 2>&1
```

## Option B: Purchased/organizational certificate

Place the provided chain and key here directly under `fullchain.pem` and
`privkey.pem` — no certbot involved. You're responsible for renewing before
expiry (`nginx/nginx.conf`'s HSTS header doesn't care how the cert was
obtained).
