# API Reference

Attraccess provides a REST API for all operations. The API is fully documented using the OpenAPI (Swagger) specification.

## Interactive API Documentation

The Swagger UI is available on every running Attraccess instance at:

```
https://your-attraccess-instance/api
```

In development mode, this is typically:

```
http://localhost:3000/api
```

<!-- TODO: Screenshot of Swagger UI -->

The Swagger UI allows you to browse all endpoints, view request/response schemas, and try out API calls directly in the browser.

## Generated API Client

The project includes a pre-generated TypeScript API client in the `libs/api-client` library. This client is auto-generated from the backend's OpenAPI specification.

**Location:** `libs/api-client/src/generated/Api.ts`

The API client provides type-safe methods for all endpoints, so you do not need to write HTTP calls manually.

## Generated React Query Hooks

For the React frontend, TanStack Query hooks are auto-generated in the `libs/react-query-client` library.

**Key files:**

| File | Description |
|------|-------------|
| `schemas.gen.ts` | Generated request/response schemas |
| `types.gen.ts` | Generated TypeScript type definitions |

These hooks handle data fetching, caching, and state management automatically.

## Authentication

The API accepts either a **session cookie** or a self-managed API token. When you log in through `/api/auth/login`, a session cookie is set and sent with subsequent requests. Create API tokens from the Account security page, then send them with `Authorization: Bearer <token>`.

Each API token has an explicit permission allow-list. Requests receive only the intersection of that allow-list and the token owner's current permissions, so removing an owner permission takes effect immediately.

> [!NOTE]
> In the Vite development setup, the frontend proxies all `/api` requests to the backend, so cookies work seamlessly on the same origin.

## Key API Modules

| Module | Base Path | Description |
|--------|-----------|-------------|
| **Auth** | `/api/auth` | Login, logout, registration, SSO |
| **Users** | `/api/users` | User management |
| **Resources** | `/api/resources` | Resource CRUD, usage sessions |
| **Projects** | `/api/projects` | Project management |
| **Settings** | `/api/settings` | System configuration |
| **Attractap** | `/api/attractap` | RFID reader management |
| **MQTT** | `/api/mqtt` | MQTT server configuration |
| **Billing** | `/api/billing` | Billing and transactions |
| **Plugins** | `/api/plugins` | Plugin management |

## Attractap WebSocket: stop session

The authenticated reader sends an `EVENT` with `data.type: "STOP_RESOURCE_USAGE_SESSION"` and `data.payload: { resourceId: number, requestId?: number }`. The reply uses the same event type and echoes the optional request ID. Required end forms postpone the stop and success reply until submitted; failures return `error: string` rather than success.

A successful reply contains `success: true` and `endedOwnSession: boolean`, comparing the ended usage's owner with the authenticated actor. `durationSeconds?: number` is elapsed session time from the committed start/end timestamps, rounded down to whole seconds and clamped to zero. Invalid or unavailable timestamps omit it. This is not operating time or billed minutes.

`billingSummary?: { amount: number, total: string }` appears only for the owner's nonzero charge. `amount` is in database currency units; `total` is the existing formatted currency/credits string and must be displayed unchanged. Billing lookup failure does not fail the completed stop or remove duration/ownership. New firmware accepts whole duration values in the range 0–4294967295 and falls back to legacy feedback for missing or invalid summary metadata. Older firmware ignores the additive fields.

```json
{"event":"EVENT","data":{"type":"STOP_RESOURCE_USAGE_SESSION","payload":{"success":true,"requestId":42,"endedOwnSession":true,"durationSeconds":1440,"billingSummary":{"amount":290,"total":"2,90 EUR"}}}}
```

Unbilled reply (including zero charges):

```json
{"event":"EVENT","data":{"type":"STOP_RESOURCE_USAGE_SESSION","payload":{"success":true,"requestId":43,"endedOwnSession":true,"durationSeconds":1440}}}
```

## Regenerating Clients

After making changes to API endpoints, regenerate the client libraries to keep them in sync with the backend. Refer to the project's build scripts for the exact regeneration commands.

## See Also

- [Developer Overview](developer/overview.md) – Getting started
- [Architecture](developer/architecture.md) – Project structure
- [Contributing](developer/contributing.md) – How to contribute
