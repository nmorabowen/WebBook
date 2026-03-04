# WebBook

WebBook is a markdown-first publishing app for books and standalone notes. It combines:

- a warm, book-style public reading interface,
- an authenticated web editor,
- Obsidian-style `[[wiki links]]` and backlinks,
- MathJax rendering,
- live Python execution through a separate FastAPI runner,
- filesystem-backed markdown storage with revision snapshots.

## Stack

- Next.js App Router
- React 19
- Tailwind CSS 4
- Markdown rendering with `react-markdown`
- Redis-backed rate limiting and execution caching with in-memory fallback
- FastAPI Python runner for code execution

## Local development

1. Copy `.env.example` to `.env`.
2. Install dependencies:

```bash
npm install
```

3. Start the Next.js app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

The app bootstraps sample content on first load under [`content`](/c:/Users/nmb/Desktop/WebBook/content).

Default local admin credentials:

- Username: `admin`
- Password: `webbook-admin`

Change `SESSION_SECRET` and `ADMIN_PASSWORD_HASH` before using this outside local development.

## Analytics

WebBook supports optional Google Analytics 4 pageview tracking for public reading
routes and the authenticated workspace: `/`, `/books/*`, `/notes/*`, and `/app/*`.

Signed-in users can review the current analytics status from the workspace at
`/app/settings/analytics`.

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` in your environment to enable it. Leave the
variable empty to keep analytics disabled.

## Python execution

The web app proxies Python execution requests to the service in [`services/python-runner`](/c:/Users/nmb/Desktop/WebBook/services/python-runner).

To run the full stack with Docker:

```bash
docker compose up --build
```

This starts:

- the Next.js app on `:3000`
- Redis on `:6379`
- the Python runner on `:8001`

## Production deployment

WebBook includes an ONCE-style deployment flow for a Debian Bookworm VPS with:

- host-level Caddy for HTTPS
- Docker Compose runtime
- installs and updates that build locally on the VPS from the checked-out repo
- optional GitHub Actions update trigger over SSH
- daily local and remote backups

Primary files:

- [`.env.production.example`](/c:/Users/nmb/Desktop/WebBook/.env.production.example)
- [`docker-compose.production.yml`](/c:/Users/nmb/Desktop/WebBook/docker-compose.production.yml)
- [`deploy/install.sh`](/c:/Users/nmb/Desktop/WebBook/deploy/install.sh)
- [`deploy/webbookctl`](/c:/Users/nmb/Desktop/WebBook/deploy/webbookctl)
- [`docs/deployment.md`](/c:/Users/nmb/Desktop/WebBook/docs/deployment.md)

Bootstrap command:

```bash
curl -fsSL https://raw.githubusercontent.com/nmorabowen/WebBook/main/deploy/install.sh | sudo bash
```

For production storage, all books, notes, uploads, revisions, users, and workspace
settings live under the content root. Set `WEBBOOK_CONTENT_HOST_PATH` in
[`.env.production.example`](/c:/Users/nmb/Desktop/WebBook/.env.production.example)
to place that workspace on a different disk such as `/srv/webbook-data`.

The install and update path no longer depends on GHCR access. GitHub Actions SSH
secrets are only needed if you want the optional owner update workflow later.

### Updating a live VPS

The intended code flow is:

1. make changes locally
2. run validation
3. push to GitHub
4. update the VPS from its checked-out repo

Local validation:

```bash
npm run typecheck
npm test
npm run build
```

On the VPS:

```bash
webbookctl update
```

To deploy a specific commit or tag:

```bash
webbookctl update <ref>
```

This keeps the update path simple:

- code moves to the VPS through Git
- the VPS rebuilds the images locally
- the configured content path such as `/srv/webbook-data` is left untouched

## Useful commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Project structure

- [`src/app`](/c:/Users/nmb/Desktop/WebBook/src/app): pages and API routes
- [`src/components`](/c:/Users/nmb/Desktop/WebBook/src/components): UI, editor, markdown rendering
- [`src/lib/content`](/c:/Users/nmb/Desktop/WebBook/src/lib/content): filesystem content model, indexing, revisions
- [`src/lib/markdown`](/c:/Users/nmb/Desktop/WebBook/src/lib/markdown): TOC, wiki-link, and code-cell parsing helpers
- [`services/python-runner`](/c:/Users/nmb/Desktop/WebBook/services/python-runner): isolated Python execution service
