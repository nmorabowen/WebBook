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
- configured content path such as `/opt/webbook/content` or `/srv/webbook-data`
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
3. prompt for domain, admin credentials, the host content path, and backup settings
4. render `/opt/webbook/.env.production`
5. install `webbookctl`
6. configure Caddy
7. build the `web` and `python-runner` images locally on the VPS
8. start the production Compose stack
9. enable the daily backup timer

## DNS and TLS

Point your DNS A or AAAA record to the VPS IP before running the installer.

Caddy terminates TLS and proxies traffic to the app on `127.0.0.1:3000`.

## Updates

To update a running server manually:

```bash
webbookctl update
```

To deploy a specific commit or tag:

```bash
webbookctl update <ref>
```

`webbookctl update` fetches the repo, checks out the requested ref, rebuilds the
`web` and `python-runner` images locally on the VPS, restarts the stack, and then
waits for health checks to pass.

## Optional GitHub update setup

The deploy workflow expects these repository secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PORT` optional, default `22`

The workflow:

1. runs typecheck, tests, and build
2. SSHes into the server
3. runs `webbookctl update <sha>`

This setup is optional. It is not required for the first install because the VPS
builds install and update releases locally from the checked-out repo.

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

- the configured `WEBBOOK_CONTENT_HOST_PATH`
- `/opt/webbook/.env.production`
- `/opt/webbook/deploy/state`

Daily local backups are written to `/opt/webbook/backups/local`.

If Restic is configured, each backup run also pushes an encrypted snapshot to the remote repository and prunes old snapshots.

## Rollback

`webbookctl update` stores the previous release git ref before switching to a new release.

If the new release fails health checks:

- the deploy script checks out the previous release ref
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
- Installs and updates build locally on the VPS and do not require GHCR access
- Updates do not overwrite the configured content path
- To place the workspace on a separate disk, set `WEBBOOK_CONTENT_HOST_PATH` to a
  mounted path such as `/srv/webbook-data`; the container still reads it at
  `/app/content`
