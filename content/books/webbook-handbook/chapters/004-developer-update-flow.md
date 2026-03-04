---
title: Developer Update Flow
slug: developer-update-flow
createdAt: '2026-03-03T03:05:00.000Z'
updatedAt: '2026-03-03T03:05:00.000Z'
publishedAt: '2026-03-03T03:05:00.000Z'
kind: chapter
bookSlug: webbook-handbook
order: 4
summary: 'How code changes move from the developer machine to the production server.'
status: published
allowExecution: false
fontPreset: source-serif
---
# Developer Update Flow

This chapter describes how code changes move from the developer machine to the VPS.

## Local development cycle

The expected developer loop is:

1. make code or content changes locally
2. run validation
3. commit and push to `main`

Typical validation commands:

```bash
npm run typecheck
npm test
npm run build
```

## How code reaches production

The simplest production path is:

1. change code locally
2. validate locally
3. push to GitHub
4. log into the VPS
5. run:

```bash
webbookctl update
```

That command:

- fetches the latest repo state on the VPS
- checks out the requested ref or `main`
- rebuilds the `web` and `python-runner` images locally on the server
- restarts the stack
- keeps the content path unchanged
- rolls back automatically if health checks fail

## Optional GitHub Actions update path

Automatic updates can still be driven by pushes to `main`, but that flow is optional.

### Workflow

1. GitHub Actions runs CI.
2. The workflow SSHes into the server.
3. The server runs:

```bash
webbookctl update <sha>
```

## What `webbookctl update` does

The update command:

- updates the server-side repo checkout
- rebuilds the local images on the server
- restarts the production stack
- checks health for the web app and the Python runner
- rolls back automatically if the health checks fail

## GitHub secrets

The deploy workflow expects:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- optional `DEPLOY_PORT`

## What not to do

Do not rely on editing production code directly on the server. The intended source of truth for code is GitHub, while the intended source of truth for live content is the configured production content directory.

For content and operator-side updates after deployment, continue with [[webbook-handbook/user-update-flow]].
