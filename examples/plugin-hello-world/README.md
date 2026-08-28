# Hello World example plugin

A complete, working Attraccess plugin you can build, ZIP, and upload. It is the
companion to the [Developing Plugins](https://docs.attraccess.org/#/plugins/developing-plugins)
guide and exercises every core capability:

| Part                | File                                                 | What it shows                                                                                                                                          |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend controller  | [`backend/plugin.ts`](backend/plugin.ts)             | Adds `GET /hello-world/greetings` to the host API.                                                                                                     |
| Injected repository | [`backend/plugin.ts`](backend/plugin.ts)             | Reads users via `context.getRepository('User')` (needs `READ_USERS`).                                                                                  |
| Event handler       | [`backend/plugin.ts`](backend/plugin.ts)             | Subscribes to `RESOURCE_USAGE_STARTED` via `context.onEvent` (needs `LISTEN_EVENTS`).                                                                  |
| MQTT handler        | [`backend/plugin.ts`](backend/plugin.ts)             | Subscribes and publishes through the host MQTT connection (needs `ACCESS_MQTT_SERVERS`).                                                               |
| Frontend routes     | [`frontend/src/plugin.tsx`](frontend/src/plugin.tsx) | Registers the `/hello-world` and `/hello-world/capabilities` pages through `getRoutes()`.                                                              |
| Sidebar entry       | [`frontend/src/plugin.tsx`](frontend/src/plugin.tsx) | Adds a "Hello World" navigation item through `getSidebarItems()`.                                                                                      |
| Embedded slots      | [`frontend/src/plugin.tsx`](frontend/src/plugin.tsx) | Injects UI into the MQTT server detail + list views through `getSlotContributions()`, scoped to the selected server via slot context.                  |
| Host-native UI      | [`frontend/src/plugin.tsx`](frontend/src/plugin.tsx) | Builds pages from the host's shared `@heroui/react` components and `lucide-react` icons, so they look native and inherit the host theme.               |
| Shared libraries    | [`frontend/vite.config.ts`](frontend/vite.config.ts) | Reuses the host's `react-router-dom`, `@heroui/react` and `lucide-react` so `<Link>`s navigate without a reload and the UI uses a single, themed copy. |

## Layout

```
plugin-hello-world/
├── plugin.json              # manifest (backend + frontend entries, permissions)
├── package.json             # build deps + `npm run build`
├── build.mjs                # builds both halves and produces the upload ZIP
├── backend/
│   ├── plugin.ts            # the backend module (controller + service)
│   └── tsconfig.json
└── frontend/
    ├── index.html           # Vite build seed (not used by the host)
    ├── vite.config.ts       # module federation remote config
    ├── tsconfig.json
    └── src/plugin.tsx        # the frontend plugin class
```

## Build

```bash
npm install
npm run build          # → plugin-hello-world.zip
```

`build.mjs`:

1. **Backend** — bundles `backend/plugin.ts` with esbuild to `package/dist/index.js`
   (CommonJS), externalizing every host-shared package so dependency-injection
   token identity is preserved (see the guide for why this matters).
2. **Frontend** — builds `frontend/src/plugin.tsx` as a Vite module federation
   remote exposing `./plugin`, emitting `package/frontend/remoteEntry.js`.
3. Copies `plugin.json` to the package root and zips the package **contents**
   into `plugin-hello-world.zip`.

The resulting ZIP matches the layout the host expects:

```
plugin-hello-world.zip
├── plugin.json
├── dist/index.js
└── frontend/remoteEntry.js  (+ chunks)
```

If the `zip` CLI is unavailable, the `package/` directory is still produced —
zip its contents manually: `cd package && zip -r ../plugin-hello-world.zip .`

## Upload

Open the admin **Plugins** page, click **Upload Plugin**, and select
`plugin-hello-world.zip`. The server unpacks it and restarts. After the restart:

- `GET /hello-world/greetings` returns a greeting per user.
- The `/hello-world` page is reachable in the app for any logged-in user.
- Starting a resource usage session logs a line from the plugin's event handler.

## Notes

- **Recommended approach:** the frontend builds its UI from the host's own
  libraries — `@heroui/react` (components) and `lucide-react` (icons) — so it
  looks native and inherits light/dark theming for free. Both are listed in the
  frontend `shared` list (`frontend/vite.config.ts`) alongside `react`,
  `react-dom` and `react-router-dom`, so the host serves its single copy at
  runtime and the plugin bundle only carries its own code. Add
  `@tanstack/react-query` or `react-pluggable` there too if your plugin imports
  them.
- The example targets a standard Vite + `@originjs/vite-plugin-federation`
  toolchain (see `package.json` devDependencies); it is built in isolation from
  the host, exactly like a third-party plugin.
