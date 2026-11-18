# Ankur frontend

React 19 + TypeScript + Vite app for [Ankur](../README.md). It is installable
as a PWA and talks to the FastAPI backend in [`../backend`](../backend).

## Run it locally

Start the backend first (it serves the API on port 8000), then:

```bash
cd frontend
npm install
npm run dev
```

Vite proxies every `/api/*` request to `http://localhost:8000`
(see `vite.config.ts`), so no extra configuration is needed in development.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |

## Production

The root [`Dockerfile`](../Dockerfile) builds this app with `npm ci && npm run build`
and the backend serves the files in `dist/`. API calls are never cached by the
service worker (`NetworkOnly` for `/api/`), so answers always come from the server.

## Where things live

- `src/App.tsx`: app shell, upload flow and tabs
- `src/components/`: one file per panel or tab (notes, quiz, flashcards, radar, …)
- `src/lib/`: client-side helpers such as history, sessions and spaced repetition
- `public/`: favicon, PWA icon and the sample whiteboard image
