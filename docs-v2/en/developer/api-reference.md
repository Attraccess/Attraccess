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

The API uses **session cookies** for authentication. When you log in through the `/api/auth/login` endpoint, a session cookie is set. This cookie is sent with all subsequent requests.

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
| **Attractap** | `/api/attractap` | NFC reader management |
| **MQTT** | `/api/mqtt` | MQTT server configuration |
| **Billing** | `/api/billing` | Billing and transactions |
| **Plugins** | `/api/plugins` | Plugin management |

## Regenerating Clients

After making changes to API endpoints, regenerate the client libraries to keep them in sync with the backend. Refer to the project's build scripts for the exact regeneration commands.

## See Also

- [Developer Overview](developer/overview.md) – Getting started
- [Architecture](developer/architecture.md) – Project structure
- [Contributing](developer/contributing.md) – How to contribute
