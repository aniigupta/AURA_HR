# VPS hardening checklist

Run once when provisioning the production VPS. This is host-level setup —
outside what Docker/the app itself can do for you.

## 1. Firewall (ufw)

Only 80, 443, and SSH should ever be reachable from the internet — every
other service (Postgres, Redis, the observability stack) is already bound to
either the internal Docker network or `127.0.0.1` only, per
`docker-compose.prod.yml` / `docker-compose.observability.yml`.

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH        # or: sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

If you changed the default SSH port, allow that port instead of 22 —
and do it *before* running `ufw enable`, or you'll lock yourself out.

## 2. fail2ban for SSH

Bans IPs after repeated failed SSH login attempts — the same idea as the
app's own login lockout (`backend/app/core/utils.py`), applied to the host.

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
# Default sshd jail is enabled out of the box; verify with:
sudo fail2ban-client status sshd
```

## 3. Automatic security updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # answer "Yes"
```

Confirm it's actually configured to apply security updates:

```bash
cat /etc/apt/apt.conf.d/50unattended-upgrades | grep -A2 "Allowed-Origins"
```

## 4. SSH hardening (do this before disabling password auth — verify key
   login works first, in a second terminal, before closing your first session)

In `/etc/ssh/sshd_config`:

```
PasswordAuthentication no
PermitRootLogin no
```

Then: `sudo systemctl restart sshd`

## 5. Keep this list current

Re-check this checklist after any OS-level change (new services, opened
ports, new SSH keys) — it's a point-in-time snapshot, not something that
enforces itself.
