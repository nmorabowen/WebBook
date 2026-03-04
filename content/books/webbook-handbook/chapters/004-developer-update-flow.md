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

This chapter describes how WebBook should be updated from the development side.

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

## GitHub Actions deploy path

Production deploys are driven by pushes to `main`.

### Workflow

1. GitHub Actions runs CI.
2. The workflow builds the `web` and `python-runner` images.
3. Both images are pushed to GitHub Container Registry.
4. The workflow SSHes into the server.
5. The server runs:

```bash
webbookctl deploy <sha>
```

## What `webbookctl deploy` does

The deploy command:

- updates the server-side repo checkout
- changes the image tags in `.env.production`
- pulls the new images
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

Do not rely on editing production code directly on the server. The intended source of truth for code is GitHub, while the intended source of truth for live content is the production `content/` directory.

For content and operator-side updates after deployment, continue with [[webbook-handbook/user-update-flow]].
