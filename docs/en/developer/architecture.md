# Architecture

Attraccess is structured as an NX monorepo containing multiple applications and shared libraries. This page provides an overview of the project organization.

## Monorepo Structure

```
Attraccess/
├── apps/
│   ├── api/                  # NestJS backend
│   ├── frontend/             # React frontend
│   └── attractap/
│       └── firmware/         # Attractap NFC reader firmware
├── libs/
│   ├── api-client/           # Generated OpenAPI client
│   ├── react-query-client/   # Generated TanStack Query hooks
│   ├── database-entities/    # TypeORM entity definitions
│   ├── shared/               # Shared types and utilities
│   ├── plugins-backend-sdk/  # Plugin SDK for backend extensions
│   ├── plugins-frontend-sdk/ # Plugin SDK for frontend extensions
│   ├── plugins-frontend-ui/  # Shared UI components for plugins
│   └── env/                  # Environment configuration
└── storage/                  # SQLite database files (runtime)
```

## Applications

### Backend (`apps/api`)

The backend is a NestJS application that provides the REST API. It is organized into feature modules:

| Module | Description |
|--------|-------------|
| **resources** | Resource management (machines, doors) |
| **users-and-auth** | User accounts, authentication, SSO |
| **settings** | System configuration |
| **attractap** | NFC reader communication |
| **billing** | Usage-based billing |
| **mqtt** | MQTT broker integration |
| **projects** | Project management |
| **plugins** | Plugin loading and management |

### Frontend (`apps/frontend`)

The frontend is a React application built with:

- **HeroUI** – Component library for the user interface
- **TanStack Query** – Data fetching and caching
- **React Router** – Client-side routing
- **Vite** – Build tool and development server

The Vite development server proxies all `/api` requests to the backend, so the frontend always communicates through the same origin.

### Attractap Firmware (`apps/attractap/firmware`)

Firmware for the ESP32-based Attractap NFC card reader hardware. This is a separate embedded project.

## Libraries

### Generated Libraries

These libraries are auto-generated from the backend's OpenAPI specification and should not be edited manually:

| Library | Description |
|---------|-------------|
| **api-client** | TypeScript HTTP client generated from the Swagger/OpenAPI spec (`Api.ts`) |
| **react-query-client** | TanStack Query hooks generated from the API spec (`schemas.gen.ts`, `types.gen.ts`) |

After making API changes, regenerate these libraries to keep them in sync.

### Shared Libraries

| Library | Description |
|---------|-------------|
| **database-entities** | TypeORM entity definitions shared between backend modules |
| **shared** | Types, interfaces, and utility functions used across apps |
| **env** | Environment variable handling and configuration |

### Plugin SDKs

| Library | Description |
|---------|-------------|
| **plugins-backend-sdk** | SDK for developing backend plugin extensions |
| **plugins-frontend-sdk** | SDK for developing frontend plugin extensions |
| **plugins-frontend-ui** | Reusable UI components for plugin frontends |

## Database

Attraccess uses **SQLite** as its database, managed through **TypeORM**. Key characteristics:

- No separate database server required
- Database file stored in the `storage/` directory
- Migrations run automatically on application startup
- Entity definitions live in the `database-entities` library

## Authentication

Authentication is handled via **session cookies**. The system supports:

- Username/password login
- SSO via OpenID Connect (OIDC)
- SSO via SAML
- Two-factor authentication (TOTP)

## NestJS API Conventions

### Controller registration order is load-bearing

NestJS (via Express) matches routes in the order they are registered — **first registered wins**. A `:param` segment (e.g. `GET /users/:id`) matches *any* single URL segment, including strings like `with-permission`. This creates a footgun:

```
// BROKEN — :id swallows every static path that follows
controllers: [UsersAdminController,    // has GET :id
               UserPermissionsController] // has GET with-permission ← unreachable!
```

`GET /users/with-permission` was removed with the legacy boolean-permission system in ATT-566. Role assignment queries now use `GET /users?roleId=...`; do not restore the removed route when adding role-related user list behavior.

**Rules to follow when adding or splitting a controller:**

1. **Within a single controller file**, declare all static-segment routes *before* any `:param` route of the same HTTP method and same URL depth.
2. **In the `controllers: []` array of a module**, list controllers that have only static routes *before* controllers that introduce `:param` routes at the same `@Controller(prefix)`.
3. When multiple controllers share the same `@Controller('path')` prefix (e.g. all the `@Controller('users')` controllers), a `:param` route in an earlier controller will shadow static routes in later ones.

An automated guard in `apps/api/src/route-shadow.spec.ts` enforces these rules in CI — any newly introduced shadow will cause the test suite to fail.

## See Also

- [Developer Overview](developer/overview.md) – Getting started
- [API Reference](developer/api-reference.md) – REST API details
- [Contributing](developer/contributing.md) – How to contribute
