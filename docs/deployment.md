# Production Deployment

This document covers the ONCE-style production deployment flow for WebBook on a Debian Bookworm VPS.

## What gets installed

The production host uses:

- Docker and the Compose plugin
- Caddy on the host for HTTPS
- Restic for encrypted backups
- `/opt/webbook` as the application root

Runtime layout:

- `/opt/webbook/repo`
- `/opt/webbook/content`
- `/opt/webbook/.env.production`
- `/opt/webbook/deploy/state`
- `/opt/webbook/backups/local`

## Install

Run this on a fresh Debian Bookworm VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/nmorabowen/WebBook/main/deploy/install.sh | sudo bash
```

The installer will:

1. install Docker, Caddy, Restic, and supporting tools
2. clone the repo into `/opt/webbook/repo`
3. prompt for domain, admin credentials, and backup settings
4. render `/opt/webbook/.env.production`
5. install `webbookctl`
6. configure Caddy
7. start the production Compose stack
8. enable the daily backup timer

## DNS and TLS

Point your DNS A or AAAA record to the VPS IP before running the installer.

Caddy terminates TLS and proxies traffic to the app on `127.0.0.1:3000`.

## GitHub deploy setup

The deploy workflow expects these repository secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PORT` optional, default `22`

The workflow:

1. runs typecheck, tests, and build
2. pushes `web` and `python-runner` images to GHCR
3. SSHes into the server
4. runs `webbookctl deploy <sha>`

## Operator commands

Use these on the server:

```bash
webbookctl status
webbookctl logs web
webbookctl logs python-runner
webbookctl backup
webbookctl restore <backup-id>
webbookctl rollback
webbookctl update-config
webbookctl doctor
```

## Backups

Backups include:

- `/opt/webbook/content`
- `/opt/webbook/.env.production`
- `/opt/webbook/deploy/state`

Daily local backups are written to `/opt/webbook/backups/local`.

If Restic is configured, each backup run also pushes an encrypted snapshot to the remote repository and prunes old snapshots.

## Rollback

`webbookctl deploy` stores the previous release image tags before switching to a new release.

If the new release fails health checks:

- the deploy script restores the previous image tags
- the stack is restarted on the previous release
- the deploy exits non-zero

You can also run a manual rollback:

```bash
webbookctl rollback
```

## Health checks

Production health checks use:

- `GET /api/healthz` for the web app
- `GET /healthz` for the Python runner

## Notes

- Production should use `AUTH_DISABLED=false`
- Production content on the server is the source of truth
- Deploys update code and images, but do not overwrite `/opt/webbook/content`
