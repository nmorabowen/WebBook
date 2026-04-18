---
id: 602e2325-b6d5-4290-aeb0-644951eeef56
title: Installation Guide
slug: installation-guide
createdAt: '2026-03-03T03:05:00.000Z'
updatedAt: '2026-04-18T19:54:29.232Z'
publishedAt: '2026-03-03T03:05:00.000Z'
routeAliases: []
kind: chapter
bookSlug: webbook-handbook
order: 2
summary: >-
  How to install WebBook locally and on a Debian VPS and prepare the server for
  later updates.
status: published
allowExecution: false
fontPreset: source-serif
---
# Installation Guide

WebBook currently supports two main installation modes:

- local development
- production deployment on a Debian Bookworm VPS

## Local development

Use local development when working on the codebase directly.

### Steps

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Start the web app with `npm run dev`.
4. For the full stack, run `docker compose up --build`.

### Local services

The full Docker stack starts:

- the Next.js app on port `3000`
- Redis on port `6379`
- the Python runner on port `8001`

## Production deployment

Production deployment uses the ONCE-style flow added to this repository.

### Bootstrap command

```bash
curl -fsSL https://raw.githubusercontent.com/nmorabowen/WebBook/main/deploy/install.sh | sudo bash
```

### What the installer does

The installer:

1. installs Docker, Caddy, Restic, and support packages
2. clones the repository into `/opt/webbook/repo`
3. creates the deployment directories
4. prompts for the domain, admin username, admin password, content path, and backup settings
5. generates `/opt/webbook/.env.production`
6. configures Caddy for HTTPS
7. builds the production images locally on the VPS
8. starts the stack
9. installs `webbookctl`
10. enables the daily backup timer

### Recommended storage layout

For a VPS with fast system storage and a larger content disk:

- keep `/opt/webbook` on the fast system disk
- set the content path to a mounted data disk such as `/srv/webbook-data`

That keeps the application runtime on faster storage while leaving books, notes,
uploads, revisions, users, and workspace settings on the larger content volume.

## Required production assumptions

Before running the installer, make sure:

- DNS points the chosen domain to the VPS IP
- the server can reach GitHub
- ports `80` and `443` are open

## Useful production commands

```bash
webbookctl status
webbookctl update
webbookctl logs web
webbookctl backup
webbookctl rollback
```

For code updates after installation, continue with [[webbook-handbook/developer-update-flow]].
