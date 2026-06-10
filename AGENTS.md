# AGENTS.md

Short reference for agents working in this repo.

## Dev servers — always use `pnpm serve`

`pnpm serve` is safe to run in parallel from multiple worktrees. It auto-resolves free ports for API and frontend, printing them in a banner at startup:

```
┌─────────────────────────────────────────────┐
│ Attraccess dev servers                      │
│   API      → http://localhost:3001          │
│   Frontend → http://localhost:4201          │
└─────────────────────────────────────────────┘
```

**Never assume ports 3000/4200 are yours.** Parse the banner (first ~6 lines of stdout) to learn the actual ports.

While the launcher runs it also writes the resolved ports to `.dev-serve-ports.json` at the repo root (gitignored, removed on exit) — read it instead of scraping stdout:

```json
{
  "pid": 12345,
  "api": { "port": 3001, "url": "http://localhost:3001" },
  "frontend": { "port": 4201, "url": "http://localhost:4201" },
  "preview": { "port": 4301, "url": "http://localhost:4301" }
}
```

```bash
cat .dev-serve-ports.json | jq -r '.api.url'
```

Flags:

- `pnpm serve --only=api` — API only
- `pnpm serve --only=frontend` — frontend only
- `pnpm serve` — both (default)
- `pnpm serve --tui` — nx interactive terminal UI (default is streamed output, agent-friendly)

Pin a port (strict — fails on collision):

- `PORT=3010 pnpm serve`
- `VITE_PORT=4250 pnpm serve`

Solo `pnpm nx serve api` is **not** wrapped — it still hard-fails on busy 3000. Prefer `pnpm serve --only=api`.

## Local dev setup (agents)

Minimal path to a working stack for UI verification, plugin work, or browser automation.

### 1. Environment

Copy the example env if `.env` is missing:

```bash
cp .env.example .env
# AUTH_SESSION_SECRET must be set (any non-empty string for local dev)
```

Required for plugin backend routes:

```bash
# in .env
PLUGIN_DIR=storage/plugins
```

### 2. Start dev servers

```bash
pnpm serve
```

Read ports from `.dev-serve-ports.json` (do not assume 3000/4200):

```bash
FRONTEND=$(cat .dev-serve-ports.json | jq -r '.frontend.url')
API=$(cat .dev-serve-ports.json | jq -r '.api.url')
```

The API creates `storage/attraccess.sqlite` on first boot (migrations run automatically).

### 3. Seed a dev admin

After the API has started once:

```bash
node scripts/seed-dev-user.mjs
# username: devadmin
# password: Devadmin1!
```

Idempotent — safe to re-run. Uses `storage/attraccess.sqlite` by default (`sqlite3` CLI works on the same file).

### 4. Install a plugin locally (no upload UI needed)

Build the plugin SDK link, then build and copy the plugin into `PLUGIN_DIR`:

```bash
pnpm nx build plugins-backend-sdk database-entities
node scripts/link-dev-plugin-sdks.mjs   # required — plugin backends externalize the SDK
pnpm nx package plugin-rabbitmq
mkdir -p storage/plugins
rm -rf storage/plugins/rabbitmq
cp -r apps/plugins/rabbitmq/package storage/plugins/rabbitmq
```

Folder name must match `plugin.json` `"name"`. Restart `pnpm serve` after copying (or copy before first start).

If plugin backends fail with `Cannot find module '@attraccess/plugins-backend-sdk'`, re-run the link script above — the SDK is a workspace lib, not published to npm.

**Plugin frontend UI does NOT work against the vite dev server.** Module-federation `shared` (react etc.) is only wired up in built output, so plugin slot components crash with `Cannot read properties of null (reading 'useState')` under `pnpm serve`'s frontend. To verify plugin UI in a browser, serve the **built** frontend from the API instead:

```bash
pnpm nx build frontend
# in .env
STATIC_FRONTEND_FILE_PATH=dist/apps/frontend
# then
PORT=3012 pnpm serve --only=api
# browse http://localhost:3012 — same-origin /api, federation shared libs work
```

Note: deep links (e.g. `/mqtt/servers/1`) 404 on the statically served frontend — open `/`, log in, and navigate via the UI (or `document.querySelector('a[href=...]').click()` through agent-browser eval).

Also: `nx package plugin-<name>` can return a **stale cached artifact** that misses brand-new source files. If the deployed bundle lacks your changes, re-run with `--skip-nx-cache`.

### 5. RabbitMQ broker (optional, for MQTT/RabbitMQ plugin testing)

A RabbitMQ container with MQTT + management API is in `docker-compose.yml`:

```bash
docker compose up -d rabbitmq
# MQTT: localhost:1883  (user attraccess / password)
# Management API: localhost:15672
```

Configure an MQTT server in the UI (`/mqtt/servers`) pointing at `localhost:1883` with those credentials.

### 6. Browser automation (`agent-browser`)

Load the skill before scripting (commands change between versions):

```bash
agent-browser skills get core
```

**Auth shortcut:** seed the dev user, then log in via the UI. Cookie injection from curl often does not work for the SPA session — use the form or `eval` after the page loads:

```bash
FRONTEND=$(cat .dev-serve-ports.json | jq -r '.frontend.url')
agent-browser open "$FRONTEND/login"
agent-browser wait 12000                    # login form needs time to hydrate
agent-browser snapshot                      # discover @refs (e5/e6/e9 on /login)
agent-browser fill @e5 devadmin
agent-browser fill @e6 'Devadmin1!'
agent-browser click @e9
agent-browser wait 15000
agent-browser open "$FRONTEND/mqtt/servers/1"
agent-browser wait 25000                    # detection + connections panels load async
agent-browser scroll down 2200
agent-browser wait 5000
agent-browser set viewport 1440 900
agent-browser screenshot /tmp/desktop.png
agent-browser set device "iPhone 14"
agent-browser screenshot /tmp/mobile.png
```

Tips:
- **Pin ports** when multiple worktrees run: `PORT=3012 VITE_PORT=4212 pnpm serve`
- Keep waits under ~20s per command — long waits can kill the agent-browser daemon
- Re-run `agent-browser snapshot` after each interaction; `@refs` change when the DOM updates
- Dismiss the sponsor dialog if it blocks the view (`Für 1 Monat ausblenden`)
- Upload screenshots to Linear via `linear_upload_file` MCP tool

Typical flow (CSS selectors — less reliable than @refs on /login):

```bash
agent-browser open "$FRONTEND"
agent-browser fill 'textbox[name="Benutzername"]' devadmin   # or use @ref from snapshot
agent-browser fill 'textbox[name="Passwort"]' 'Devadmin1!'
agent-browser click 'button:has-text("Los geht'\''s")'
agent-browser wait 2000
agent-browser snapshot                          # discover @refs
agent-browser set viewport 1280 800             # desktop
agent-browser screenshot /tmp/desktop.png
agent-browser set device "iPhone 14"            # mobile
agent-browser screenshot /tmp/mobile.png
```

Use `agent-browser snapshot` to find selectors/refs after navigation. Screenshots attach to Linear via the `linear_upload_file` MCP tool.

### Quick checklist for plugin + MQTT UI work

1. `cp .env.example .env` + set `AUTH_SESSION_SECRET` + `PLUGIN_DIR=storage/plugins`
2. `pnpm nx build plugins-backend-sdk database-entities && node scripts/link-dev-plugin-sdks.mjs`
3. `pnpm nx package plugin-<name>` → copy to `storage/plugins/<name>/`
4. `docker compose up -d rabbitmq` (if testing RabbitMQ features)
5. `pnpm serve` → read `.dev-serve-ports.json`
6. `node scripts/seed-dev-user.mjs`
7. Log in as `devadmin` / `Devadmin1!`, configure MQTT server, verify plugin UI
8. `agent-browser` screenshots at desktop + mobile → upload to Linear comment
