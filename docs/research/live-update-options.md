# Live update options for in-app Notifications

**Question.** How can Cadence show a new in-app Notification to a user while the page is open? This note compares four options: (1) refetch on navigation/revalidation only, (2) polling, (3) server-sent events (SSE) from a resource route, (4) WebSockets. For each it covers implementation cost in this stack, how it fits one SQLite file and one server process, limits on likely hosting, and gotchas.

**Scope.** These are findings only. The choice is left for a later conversation.

_Researched 2026-11-09._

## The stack as it stands

Checked in the repo:

- `react-router`, `@react-router/node`, `@react-router/serve` and `@react-router/dev` are all pinned to **8.3.0** (`package.json`). Framework mode with `ssr: true` (`react-router.config.ts`).
- Production start is `react-router-serve ./build/server/index.js`. There is no custom server file. Dev is `react-router dev` (Vite 7, `vite.config.ts` has only the `tailwindcss`, `reactRouter` and `tsconfigPaths` plugins).
- One `better-sqlite3` connection is opened lazily per process on `data.db`, with `journal_mode = WAL` and `foreign_keys = ON` (`app/db/index.ts`). Drizzle wraps that connection.
- The root app layout `app/routes/layout.app.tsx` has a loader that runs several queries on every revalidation: the user list, the current user, recent courses with per-course progress, country tier and team admin. `sonner`'s `<Toaster>` is already mounted there, so a toast surface exists.
- There is no Notification table yet. "In-App Notifications — bell icon with unread count" appears only as idea #23 in `_internal/feature-ideas.md`.
- **No deployment or hosting config is in the repo.** There is no Fly/Render/Railway/Vercel/Netlify file and no app Dockerfile. The only Dockerfile, `.sandcastle/Dockerfile`, builds the agent sandbox, not the app. "Likely hosting" below is therefore inferred from the constraints: a writable SQLite file on local disk plus `react-router-serve` points to one long-running Node container with a persistent volume.

## How `react-router-serve` 8.3.0 handles requests

These facts affect options 3 and 4, so they are verified in source:

- `react-router-serve` creates an Express 5 app, adds `compression()`, static middleware and `morgan`, sends every route to `@react-router/express`'s `createRequestHandler`, and calls `app.listen(...)`. User code never receives the `http.Server`, and the CLI has no options. [cli.ts@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/packages/react-router-serve/cli.ts); [serve docs](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/api/other-api/serve.md): "By design, we do not provide options to customize the React Router App Server … you can migrate to the `@react-router/express` adapter."
- When a loader returns a `Response` with a `ReadableStream` body, `@react-router/node` writes it chunk by chunk. After each `write` it calls `writable.flush()` if that function exists. [stream.ts@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/packages/react-router-node/stream.ts)
- That matters because the `compression` middleware buffers output and "does not work out of the box with server-sent events". Its fix is to call `res.flush()`. [compression README](https://github.com/expressjs/compression#server-sent-events). `text/event-stream` has no entry in mime-db, but `compressible` matches `^text\/`, so compression _would_ apply to it. [compressible index.js](https://github.com/jshttp/compressible/blob/master/index.js), [compression index.js](https://github.com/expressjs/compression/blob/master/index.js). The per-chunk `flush()` above appears to make this safe. Setting `Cache-Control: no-transform` skips compression completely: compression's `shouldTransform` checks for it.
- `@react-router/express` gives each `Request` an `AbortController`. It aborts on `res` `close` if `finish` has not fired yet. That is exactly what happens when a client drops a long-lived stream, so `request.signal` can be used for cleanup. [server.ts@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/packages/react-router-express/server.ts)

---

## Option 1: Refetch on navigation/revalidation only

**How it works.** Add an unread-count/notifications query to a loader, most naturally the app layout loader. In framework mode with SSR, "route loaders are automatically revalidated after all navigations and form submissions". [route-module.md@8.3.0 § shouldRevalidate](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/start/framework/route-module.md#shouldrevalidate). React Router's model is "automatic synchronization through revalidation … making most client-side caching redundant". [state-management.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/explanation/state-management.md)

**Cost/complexity.** Lowest. It is one query in an existing loader and nothing new on the client. A new notification shows up the next time the user clicks a link or submits a form, including fetcher submissions. It does **not** show up while the user sits idle on a page, for example watching a lesson video.

**Single SQLite / one process.** No new load. It adds one indexed read per navigation to a loader that already runs several synchronous `better-sqlite3` queries.

**Hosting.** No constraints beyond what the app already needs.

**Gotchas.**
- This does not meet "while the page is open" unless the user interacts. Anything that suppresses layout revalidation through `shouldRevalidate` would also suppress the badge update.
- A plain `fetch()` to a resource route "does not go through the router, so it does not revalidate loaders". [optimize-revalidation.md (main)](https://github.com/remix-run/react-router/blob/main/docs/how-to/optimize-revalidation.md); same statement in [resource-routes.md (main)](https://github.com/remix-run/react-router/blob/main/docs/how-to/resource-routes.md). The 8.3.0 docs have the same `fetcher.load` text but a shorter page.

## Option 2: Polling (`useRevalidator` or a fetcher on an interval)

**How it works.**
- **2a, `useRevalidator`.** The hook exists to "Revalidate the data on the page for reasons outside of normal data mutations like Window focus or polling on an interval". It returns `{ revalidate(): Promise<void>, state }`. [useRevalidator.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/api/hooks/useRevalidator.md). Calling it on a `setInterval` re-runs **all active loaders** on the page.
- **2b, fetcher on an interval.** Add a small resource route such as `api/notifications`, which has a loader and no default export ([resource-routes.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/how-to/resource-routes.md)). Then call `fetcher.load("/api/notifications?since=…")` on an interval ([useFetcher.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/api/hooks/useFetcher.md)). This hits only that one loader. A fetcher "can interrupt themselves … cancel the interrupted request and immediately process the new one", so overlapping ticks do not pile up on the client. [race-conditions.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/explanation/race-conditions.md)

**Cost/complexity.** Low. Roughly 20–40 lines: an interval hook, optional visibility handling, and for 2b one resource route. No server or infrastructure changes. It works the same in `react-router dev` and `react-router-serve`.

**Single SQLite / one process.** Each tick is one short HTTP request plus one read. better-sqlite3 recommends WAL mode for concurrent read/write performance, and the app already enables it. [better-sqlite3 performance.md](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md). Load is about _(open tabs × 1/interval)_ requests per second. At a 15–30 s interval that is small for one process. With **2a**, though, every tick re-runs the whole layout loader (users list, progress calculations and so on) plus the child route's loaders. That costs much more per tick than 2b's single query.

**Hosting.** Ordinary short requests, so it works on any host, serverless included. It does not depend on the server keeping state between requests.

**Gotchas.**
- Latency is up to one interval.
- Browsers throttle timers in hidden tabs. Per MDN, windows "are subjected to throttling after 30 seconds" (10 s in Chrome). [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). Pause polling on `visibilitychange` and refresh on focus, as in the `useRevalidator` doc example.
- With 2a, `revalidator.state` changes and loaders re-run under the user. Any route that returns `false` from `shouldRevalidate` skips its loader. [route-module.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/start/framework/route-module.md#shouldrevalidate)
- `morgan("tiny")` logs every poll, so logs get noisy.
- The 401 "Select a user" dev flow means polls need the session cookie. Same-origin fetches send it.

## Option 3: Server-sent events via a resource route

**How it works.** A resource route loader such as `api/notifications/stream` returns `new Response(readableStream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } })`. The client opens `new EventSource("/api/notifications/stream")`. An `EventSource` "opens a persistent connection to an HTTP server, which sends events in `text/event-stream` format", and SSE is unidirectional, server to client. [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource). Messages are UTF-8 text blocks separated by a blank line, with `event`, `data`, `id` and `retry` fields. A line starting with `:` is a comment. [MDN Using SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events). On a new notification, the client either renders it directly or calls `revalidate()` / `fetcher.load()` so the source of truth stays a loader.

**Cost/complexity.** Moderate. No new dependencies and no custom server: it fits `react-router-serve` as-is, because streamed bodies are flushed per chunk (see above). It needs three pieces:
1. **A way to know when to send.** SQLite has no LISTEN/NOTIFY. Because there is one process and every write goes through app code, an in-process `EventEmitter` (or a `Map<userId, Set<controller>>`) fired from the "create notification" service is enough. The alternative is for each open stream to poll SQLite on a timer, which is server-side polling. Writes made outside the server process, such as `npm run db:seed` or a script, would not emit events under the emitter approach.
2. **Cleanup** on `request.signal` abort. `@react-router/express` aborts it on client disconnect.
3. **A client hook** that manages the `EventSource` lifecycle.

**Single SQLite / one process.** A good fit. Each open tab costs one idle socket plus a closure. No per-tick DB reads are needed with the in-process emitter. The emitter works only **because** there is one process. With two or more instances, an event raised in instance A never reaches a stream held by instance B, so a broker would be needed. That is a different architecture.

**Hosting.**
- It needs a host that allows long-lived HTTP responses: a long-running Node container (the Docker targets in the RR deploy docs: Fly.io, Railway, Cloud Run, ECS and others; [deploying.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/start/framework/deploying.md)).
- Proxies and load balancers may cut idle connections. The WHATWG spec warns that "Legacy proxy servers are known to … drop HTTP connections after a short timeout" and suggests a comment line "every 15 seconds or so". [HTML § server-sent events, authoring notes](https://html.spec.whatwg.org/multipage/server-sent-events.html#authoring-notes)
- On serverless, streams end at the function's maximum duration. For example, Vercel Functions are capped at 300 s by default. [Vercel function limits](https://vercel.com/docs/functions/limitations). A local SQLite file is already a poor fit for serverless anyway.

**Gotchas.**
- **The connection limit over HTTP/1.1.** Without HTTP/2, browsers allow only **6** SSE connections per browser + domain across _all tabs_. The bug is marked "Won't fix" in Chrome and Firefox. Over HTTP/2 the limit is negotiated, with a default of 100. [MDN Using SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events). `react-router-serve` speaks HTTP/1.1. Whether users get HTTP/2 depends on the TLS-terminating proxy in front of it. A seventh tab would hang other requests to the origin. Mitigations from the spec: share one `EventSource` through a SharedWorker, or let users turn it off per page. [HTML authoring notes](https://html.spec.whatwg.org/multipage/server-sent-events.html#authoring-notes)
- **Reconnects are automatic.** The browser waits the `retry` reconnection time, then reconnects and sends a `Last-Event-ID` header if an `id` was set. [HTML § EventSource reestablish](https://html.spec.whatwg.org/multipage/server-sent-events.html). Using the notification row id as `id` lets the server replay anything missed. Without that, a gap during reconnection loses events.
- **Compression and buffering.** It works today because `@react-router/node` calls `flush()`. Setting `Cache-Control: no-cache, no-transform` is a cheap belt-and-braces step. Any reverse proxy that buffers responses must also be told not to buffer (proxy-specific; not verified here).
- **Keep-alives.** Send a `:` comment roughly every 15 s ([HTML authoring notes](https://html.spec.whatwg.org/multipage/server-sent-events.html#authoring-notes); [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)). Clear intervals on abort, or they leak.
- **Dev server.** In dev, `@react-router/serve` purges the require cache per request, so "Any values in the module scope will be 'reset'". [serve.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/api/other-api/serve.md). A module-level emitter can split into several instances in dev, and Vite HMR has the same effect. Pin it to `globalThis`. Whether streaming through `react-router dev` (Vite) also flushes per chunk was **not verified**.
- **Auth.** `EventSource` is same-origin here, so the session cookie is sent. Check the user in the loader exactly as other loaders do.

## Option 4: WebSockets

**How it works.** WebSockets give "a two-way interactive communication session between the user's browser and a server". [MDN WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API). The connection starts as an HTTP request with an `Upgrade` header. In Node, the `http.Server` emits `'upgrade'`, and "By default all HTTP upgrade requests are ignored … unless you listen to this event". [Node http docs, Event 'upgrade'](https://nodejs.org/api/http.html#event-upgrade). The usual library is `ws`, attached with `server.on('upgrade', …)` + `wss.handleUpgrade(...)`, or `new WebSocketServer({ server })`. [ws README](https://github.com/websockets/ws#readme)

**Cost/complexity.** Highest.
- **A custom server is required.** React Router loaders and actions cannot handle an HTTP upgrade, and `react-router-serve` never gives you the `http.Server` and has no options ([cli.ts@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/packages/react-router-serve/cli.ts), [serve.md@8.3.0](https://github.com/remix-run/react-router/blob/react-router%408.3.0/docs/api/other-api/serve.md)). Moving to `@react-router/express` with your own `server.js` means: rebuilding compression, static assets and morgan; changing the `start` script; and wiring Vite middleware mode for dev. The official [`node-custom-server` template](https://github.com/remix-run/react-router-templates/blob/main/node-custom-server/server.js) shows the shape: `vite.createServer({ server: { middlewareMode: true } })` in dev and `app.listen` in prod.
- **New dependency** (`ws`).
- **Your own auth on upgrade.** Parse the session cookie from the upgrade request, because the loader/session helpers do not run there.
- **Client reconnect/backoff logic.** Unlike `EventSource`, `WebSocket` does not reconnect on its own. Vercel's docs, for instance, tell clients to handle reconnects with backoff. [Vercel WebSockets](https://vercel.com/docs/functions/websockets)
- **Dev parity.** Under `react-router dev` you would either run the custom server in dev too, or add a Vite plugin with `configureServer` (which "is not called when running the production build"). [Vite plugin API](https://github.com/vitejs/vite/blob/main/docs/guide/api-plugin.md#configureserver)

**Single SQLite / one process.** Same story as SSE. The in-process emitter works because there is one process, and client-to-server messages would arrive on the same process, so they could write to SQLite directly. Bidirectionality is unused for "show a new notification". Mark-as-read can stay an ordinary action, which keeps revalidation.

**Hosting.**
- It needs upgrade support end to end: the proxy/load balancer must pass `Upgrade`. Long-running containers generally do.
- On serverless, Vercel now supports WebSockets but "connections close when a Vercel Function reaches its maximum duration", and "New WebSocket connections are not guaranteed to reach the same Vercel Function instance". [Vercel WebSockets](https://vercel.com/docs/functions/websockets). That breaks the in-process emitter model.

**Gotchas.**
- An open WebSocket "may" keep the page out of the bfcache, so close it when leaving. [MDN WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- There is no backpressure in the `WebSocket` API. [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket). This is irrelevant at notification volumes.
- WebSockets are not subject to the 6-connection HTTP/1.1 limit that SSE hits, and tabs with live WebSockets "go unthrottled". [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- In dev, the same module-scope reset and HMR issue applies to any registry of sockets.

---

## Comparison

| | 1. Revalidate on nav only | 2. Polling (2a `useRevalidator` / 2b fetcher) | 3. SSE resource route | 4. WebSockets |
|---|---|---|---|---|
| Delivers while idle on a page | No | Yes, after ≤ 1 interval | Yes, near-instant | Yes, near-instant |
| New server pieces | None | 2a none; 2b one resource route | One resource route + in-process emitter | Custom Express server + `ws` + upgrade auth |
| Works with `react-router-serve` as-is | Yes | Yes | Yes (per-chunk `flush()` defeats compression buffering) | **No**: needs `@react-router/express` custom server |
| New dependencies | None | None | None | `ws` (or similar) |
| DB load (single SQLite, WAL) | +1 read per navigation | 2a: whole loader tree per tick per tab; 2b: one read per tick per tab | ~0 idle; push on write via emitter | ~0 idle; push on write via emitter |
| Relies on single process | No | No | Yes (emitter); multi-instance needs a broker | Yes (emitter); multi-instance needs a broker |
| Hosting needs | Any | Any, incl. serverless | Long-lived HTTP responses; idle-timeout keep-alives | Upgrade passthrough; long-lived connections |
| Browser limits | — | Timers throttled in hidden tabs | 6 connections per browser+domain on HTTP/1.1 | Not affected by that limit; tab unthrottled |
| Reconnect | n/a | n/a | Built in (`retry`, `Last-Event-ID`) | Hand-written |
| Rough implementation cost | Very low | Low | Moderate | High |

## Sources and method

The reactrouter.com, developer.mozilla.org, html.spec.whatwg.org, sqlite.org and nodejs.org sites were firewalled from this sandbox. Content was read from the **source repositories those sites publish from**, and the published URLs are cited:

- **React Router.** `remix-run/react-router` at tag **`react-router@8.3.0`**, matching this repo's pin. Two docs were read on `main` (8.5.1) and are labelled "(main)". The equivalents on reactrouter.com are under `/api/hooks/useRevalidator`, `/how-to/resource-routes`, `/start/framework/route-module` and so on.
- **MDN.** `mdn/content` (`files/en-us/web/api/...`).
- **WHATWG HTML.** `whatwg/html` `source` (Server-sent events section, "Authoring notes" and reestablish-connection steps).
- **Node.** `nodejs/node` `doc/api/http.md`.
- **Fetched directly:** `expressjs/compression`, `jshttp/compressible`, `jshttp/mime-db`, `WiseLibs/better-sqlite3` docs, `websockets/ws` README, `remix-run/react-router-templates`, `vitejs/vite` docs, and vercel.com docs.

Not verified: SQLite's own WAL page (sqlite.org was blocked; better-sqlite3's docs were used instead), whether `react-router dev` flushes streamed responses per chunk, and specific hosts' proxy idle timeouts (no host is chosen in the repo).
