---
title: User Update Flow
slug: user-update-flow
createdAt: '2026-03-03T03:05:00.000Z'
updatedAt: '2026-03-03T03:05:00.000Z'
publishedAt: '2026-03-03T03:05:00.000Z'
kind: chapter
bookSlug: webbook-handbook
order: 5
summary: 'How an administrator or operator updates content, settings, backups, and restores in a deployed instance.'
status: published
allowExecution: false
fontPreset: source-serif
---
# User Update Flow

This chapter covers updates from the operator or administrator side after WebBook is already installed.

## Content updates

Most day-to-day updates do not require a server shell. They happen directly inside WebBook:

- create books, chapters, and notes
- edit markdown
- publish or unpublish pages
- upload media
- adjust typography
- manage general settings
- export or import a workspace zip

In production, the configured server-side content directory is the live source of truth for these changes. That will often be `content/` inside the container and a host path such as `/srv/webbook-data` on the VPS.

## Administrative updates

The administrator can also:

- create users
- reset user passwords
- change the admin password
- adjust upload limits and workspace settings

## Backup and restore

Use these commands on the server:

```bash
webbookctl backup
webbookctl restore <backup-id>
```

The backup scope includes:

- books and notes
- users
- workspace settings
- media uploads
- deployment state

## Re-running the installer

The installer is designed to be idempotent. That means it can be re-run to refresh configuration without deleting the existing content store.

That is useful when:

- the domain changes
- backup settings change
- the server needs to be reprovisioned carefully

## Export and migration

WebBook also includes a workspace export and import flow. That is useful for:

- moving a site to a new machine
- taking a manual off-site snapshot
- restoring content into a clean instance

For infrastructure sizing, continue with [[webbook-handbook/proxmox-vps-recommendations]].
