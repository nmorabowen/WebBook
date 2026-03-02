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
