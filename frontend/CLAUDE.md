# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # dev server (0.0.0.0)
pnpm build            # production build (adapter-node)
pnpm preview          # serve production build locally
pnpm check            # svelte-check + TS type checking
pnpm lint             # prettier --check + eslint
pnpm format           # prettier --write
pnpm openapi:fastapi  # regenerate src/lib/api/paths/fastapi.d.ts from backend at localhost:9000
```

> README uses `bun`, but this repo has `pnpm-lock.yaml` — use `pnpm`.

## Environment Variables

```ini
PUBLIC_APP_TITLE=SvelteKitten          # client-side app title ($env/dynamic/public)
BACKEND_API_URL=http://localhost:9000  # backend base URL ($env/dynamic/private, server-only)
```

## Architecture

### Request lifecycle

Every server request passes through `src/hooks.server.ts` via SvelteKit's `sequence`:

1. **`handleAuthGuard`** — checks `(auth)` route group; redirects to `/login` if `refresh_token` cookie is missing or JWT-expired (300 s buffer via `jsonwebtoken`)
2. **`handleFastApiClient`** — attaches a typed OpenAPI client to `event.locals.fastapiClient` for use in server `load` / `action` functions

### API proxy (`src/routes/api/proxy/[...slug]/+server.ts`)

All browser→backend traffic goes through `/api/proxy/**`. The proxy:
- Strips hop-by-hop headers and `content-encoding` before forwarding
- Injects `Authorization: Bearer <access_token>` from cookies
- On 401: calls `/v1/auth/refresh` with the `refresh_token`, retries the original request, or clears cookies and returns the original 401

### OpenAPI client

`src/lib/api/fastapi-client.ts` wraps `openapi-fetch` with types from `src/lib/api/paths/fastapi.d.ts`. The client always routes through `/api/proxy`, so the proxy handles auth transparently.

- Server code: use `event.locals.fastapiClient`
- Client-side code: import the default export from `$lib/api/fastapi-client`

Regenerate types after backend schema changes: `pnpm openapi:fastapi`

### Auth (`src/lib/utils/auth.ts`)

- `access_token` cookie: 10-minute TTL
- `refresh_token` cookie: 7-day TTL
- Protected routes are identified by `(auth)` in the SvelteKit route ID
- Cookie names `access_token` / `refresh_token` must match exactly — used across proxy, guard, and utils

### Forms

Use **Superforms + Zod** for all forms. Schema in `src/lib/schemas/`, server action in `+page.server.ts`, component in a co-located `*-form.svelte`. See `src/routes/login/` for the reference implementation.

### UI components

`src/lib/components/ui/` contains shadcn-style components (Button, Card, Form, Sidebar, etc.) built on `bits-ui` + Tailwind v4. Add new components here following the existing pattern (`component.svelte` + `index.ts` re-export).

### Logging

Use `src/lib/logger.ts` (pino). `logger.inspect()` / `logger.dir()` / `logger.table()` only emit in dev mode.

## Svelte 5 — required workflow for all .svelte / .svelte.ts files

### CLI tools (use via `npx @sveltejs/mcp`)

When uncertain about syntax or APIs:
```bash
npx @sveltejs/mcp list-sections
npx @sveltejs/mcp get-documentation "<section1>,<section2>"
```

Before finalizing any Svelte component, validate and iterate until no issues remain:
```bash
npx @sveltejs/mcp svelte-autofixer ./src/path/to/Component.svelte
# or inline (escape $ as \$ to avoid shell substitution):
npx @sveltejs/mcp svelte-autofixer '<script>let count = \$state(0);</script>'
```

### Svelte 5 best practices (runes mode only)

Always use runes — never use legacy Svelte 4 patterns:

| Avoid | Use instead |
|-------|-------------|
| `let count = 0` (implicit reactivity) | `$state` |
| `$:` assignments/statements | `$derived` / `$effect` |
| `export let` / `$$props` | `$props` |
| `on:click={...}` | `onclick={...}` |
| `<slot>` / `$$slots` / `<svelte:fragment>` | `{#snippet}` / `{@render}` |
| `<svelte:component this={X}>` | `<X>` |
| `use:action` | `{@attach ...}` |
| stores for shared reactivity | classes with `$state` fields |
| `class:` directive | clsx-style arrays/objects in `class` attribute |

Key rules:
- Use `$state` only for variables that trigger reactive updates; use `$state.raw` for large objects that are only reassigned (e.g. API responses)
- Derive computed values with `$derived` (expression) or `$derived.by` (function) — never compute in `$effect`
- `$effect` is an escape hatch; avoid updating state inside effects
- Always use keyed `{#each}` blocks — never use index as key
- Use `createContext` (not `setContext`/`getContext`) for type-safe context
- Treat `$props` values as potentially changing — derive dependent values with `$derived`
- Style child components via CSS custom properties; use `:global` only as fallback
