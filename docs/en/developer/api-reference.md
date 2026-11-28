# API Reference

<!-- llms-description: Describes the REST API and its OpenAPI docs, the generated API client and React Query hooks, authentication and key modules. -->

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

| File             | Description                           |
| ---------------- | ------------------------------------- |
| `schemas.gen.ts` | Generated request/response schemas    |
| `types.gen.ts`   | Generated TypeScript type definitions |

These hooks handle data fetching, caching, and state management automatically.

## Authentication

The API accepts either a **session cookie** or a self-managed API token. When you log in through `/api/auth/login`, a session cookie is set and sent with subsequent requests. Create API tokens from the Account security page, then send them with `Authorization: Bearer <token>`.

Each API token has an explicit permission allow-list. Requests receive only the intersection of that allow-list and the token owner's current permissions, so removing an owner permission takes effect immediately.

> [!NOTE]
> In the Vite development setup, the frontend proxies all `/api` requests to the backend, so cookies work seamlessly on the same origin.

## Key API Modules

| Module        | Base Path        | Description                      |
| ------------- | ---------------- | -------------------------------- |
| **Auth**      | `/api/auth`      | Login, logout, registration, SSO |
| **Users**     | `/api/users`     | User management                  |
| **Resources** | `/api/resources` | Resource CRUD, usage sessions    |
| **Projects**  | `/api/projects`  | Project management               |
| **Settings**  | `/api/settings`  | System configuration             |
| **Attractap** | `/api/attractap` | RFID reader management           |
| **MQTT**      | `/api/mqtt`      | MQTT server configuration        |
| **Billing**   | `/api/billing`   | Billing and transactions         |
| **Plugins**   | `/api/plugins`   | Plugin management                |

## Attractap WebSocket: stop session

The authenticated reader sends an `EVENT` with `data.type: "STOP_RESOURCE_USAGE_SESSION"` and `data.payload: { resourceId: number, requestId?: number }`. The reply uses the same event type and echoes the optional request ID. Required end forms postpone the stop and success reply until submitted; failures return `error: string` rather than success.

A successful reply contains `success: true` and `endedOwnSession: boolean`, comparing the ended usage's owner with the authenticated actor. `durationSeconds?: number` is elapsed session time from the committed start/end timestamps, rounded down to whole seconds and clamped to zero. Invalid or unavailable timestamps omit it. This is not operating time or billed minutes.

`billingSummary?: { amount: number, total: string }` appears only for the owner's nonzero charge. `amount` is in database currency units; `total` is the existing formatted currency/credits string and must be displayed unchanged. Billing lookup failure does not fail the completed stop or remove duration/ownership. New firmware accepts whole duration values in the range 0–4294967295 and falls back to legacy feedback for missing or invalid summary metadata. Older firmware ignores the additive fields.

```json
{
  "event": "EVENT",
  "data": {
    "type": "STOP_RESOURCE_USAGE_SESSION",
    "payload": {
      "success": true,
      "requestId": 42,
      "endedOwnSession": true,
      "durationSeconds": 1440,
      "billingSummary": { "amount": 290, "total": "2,90 EUR" }
    }
  }
}
```

Unbilled reply (including zero charges):

```json
{
  "event": "EVENT",
  "data": {
    "type": "STOP_RESOURCE_USAGE_SESSION",
    "payload": { "success": true, "requestId": 43, "endedOwnSession": true, "durationSeconds": 1440 }
  }
}
```

## Session duration and extension

Machines can have a **max session time** and can **require a duration estimate** (resource fields `maxSessionDurationMinutes`, `requireSessionDurationEstimate` and `defaultSessionDurationEstimateMinutes`; machines only, doors ignore them). A session stores its deadline when it starts: `autoEndAt` (when the server ends it), `maxAutoEndAt` (the latest the end can be extended to; `null` without a max session time, then the 30 day limit applies) and `estimatedDurationMinutes`. Changing the resource settings later does not change running sessions.

**Starting.** `POST /api/resources/{resourceId}/usage/start` accepts the optional `estimatedDurationMinutes` (1–43200). It is ignored on resources that do not require an estimate. Errors are `400` with a machine-readable `code`:

| Code                                        | Meaning                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SESSION_DURATION_ESTIMATE_REQUIRED`        | The resource requires an estimate and the request has none. The body names `maxSessionDurationMinutes` (or `null`). |
| `SESSION_DURATION_ESTIMATE_EXCEEDS_MAXIMUM` | The estimate is above the max session time.                                                                         |

> [!WARNING]
> API-token and MCP clients that start sessions fail with `SESSION_DURATION_ESTIMATE_REQUIRED` on every resource where an admin turns on **Require duration estimate**. Send `estimatedDurationMinutes` there. This also applies to a supervised start request (`POST /api/resources/{resourceId}/usage/supervision/request`): the server checks the estimate when the request is made, not when the supervisor approves it.

**Extending.** `POST /api/resources/{resourceId}/usage/extend` moves `autoEndAt` later. The body takes `usageId`, `extendByMinutes` or `toMax`:

```json
{ "usageId": 123, "extendByMinutes": 60 }
```

`usageId` is optional; `extendByMinutes` is one of 60, 120, 240, 360, 720 or 1440; `toMax` (boolean) replaces it. Without `usageId` your own session is extended. The session owner and everybody allowed to end the session may extend it. `toMax: true` sets exactly the start plus the max session time. The response is the session with its new `autoEndAt`; the change is audited (`usage_session.extended`) and pushed to the web app and to readers. Errors are `400` with a `code` (or `403` if you may not end the session); nothing is clipped:

| Code                                | Meaning                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SESSION_EXTENSION_EXCEEDS_MAXIMUM` | The new end would be later than `maxAutoEndAt` (or the 30 day limit). The body has `maxAutoEndAt`.                             |
| `SESSION_EXTENSION_NOT_POSSIBLE`    | The session has no automatic end, it has passed, the session is being ended, or `toMax` on a machine without max session time. |
| `SESSION_EXTENSION_INVALID`         | Neither a permitted `extendByMinutes` nor `toMax` was sent.                                                                    |

**Automatic end.** A job ends sessions that reached `autoEndAt` as the system, normally within a minute: end forms are skipped, stop flows run, billing is unchanged, and the end note is "Automatically ended: maximum session time reached" or "Automatically ended: estimated duration elapsed". The audit entry carries the end reason (`auto_maximum` or `auto_estimate`).

## Attractap WebSocket: session duration

A reader announces `capabilities.sessionDuration: true` in `READER_FIRMWARE_INFO` when it has a duration input and extend controls. The resource list then carries, per machine, `requireSessionDurationEstimate` and `maxSessionDurationMinutes`. Every listed session may carry `autoEndAt` (ISO), `autoEndUtcOffsetMinutes`, `autoEndInSeconds`, `hasMaxSessionTime` and `extendLimitInSeconds` (seconds until the latest possible end), counted from the moment the list was built.

`START_RESOURCE_USAGE_SESSION` accepts the optional `estimatedDurationMinutes`; the server validates it like a web start. A start from a reader without the capability is never refused for a missing estimate: the deadline is the max session time, or the default estimate (60 minutes if unset) without a max.

`EXTEND_RESOURCE_USAGE_SESSION` with `payload: { resourceId, usageId?, extendByMinutes?, toMax?, requestId? }` extends the card holder's session under the same identity rules as a stop. The reply is `{ success: true, usageId }` or `{ error }` with the codes above. The reader receives a fresh resource list, also when the session was extended elsewhere.

## Change the project of a running session

`POST /api/resources/{resourceId}/usage/sessions/active/project` moves your own running machine session to another of your projects, or to none, without stopping the machine (see [Changing the project of a running session](resources/usage-tracking.md#changing-the-project-of-a-running-session)). The body:

```json
{ "mode": "whole-session", "projectId": 12, "usageId": 123, "formSubmissions": [] }
```

`mode` is required and has no default:

| `mode`          | What happens                                                                                                                           | Response (`201`)                                                  | Forms and flow trigger                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `whole-session` | The running usage record only changes its project. Nothing is metered or billed. Earlier parts of a split session keep their projects. | The same record                                                   | `project-reassign`, `input.resource.usage.project-reassigned` |
| `split`         | The running record ends and keeps its project; a continuation starts at the same instant.                                              | The continuation; its `previousUsageId` names the part that ended | `project-switch`, `input.resource.usage.project-switched`     |

`projectId` is a project you are a member of, or `null` for no project. `usageId` is optional and names the running session, so a session that ended or was split meanwhile is not mistaken for its successor. `formSubmissions` answers the forms required for the action of the chosen mode. If a required flow, or with `split` a meter reading or the balance check, fails, nothing changes. For ended sessions use `PUT /api/resources/{resourceId}/usage/sessions/{usageId}/project` as before. Errors:

| Status | Meaning                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | `mode` is missing or unknown, `projectId` is missing or not a positive whole number, the session already belongs to this project, it is not a running machine session, a required form is missing, or a flow failed (`FLOW_EXECUTION_ERROR`). With `split` also: the balance does not cover a new session (when the resource charges a split as one), or a billed meter could not be read (`METER_SWITCH_FAILED`). |
| `403`  | The session named by `usageId` belongs to somebody else (only its owner can change it), or the network restriction for starting a session applies.                                                                                                                                                                                                                                                                 |
| `404`  | No running session of yours on the resource, or the project does not exist or you are not a member of it.                                                                                                                                                                                                                                                                                                          |
| `409`  | Another change of the machine's sessions is in progress, or the session changed during the change. Try again.                                                                                                                                                                                                                                                                                                      |

`GET /api/billing/usages/{usageId}/running-part` returns how the running part of a continuation will be billed, for estimating its bill: `flatCredits` (the fee per usage this part pays, `0` when an earlier part paid it), `roundingStartTime` (minutes are counted from here) and `priorCredits` (what earlier parts of the same rounding charged). It answers the session's owner, billing managers and resource managers; for anybody else, and for a session that is not running, it answers `404`.

## Attractap WebSocket: change the project

A reader announces `capabilities.projectSwitch: true` in `READER_FIRMWARE_INFO` when it can change the project of a running session. Only such readers get the fields below and may send the event; others are refused with `PROJECT_SWITCH_NOT_SUPPORTED`.

| Direction       | Event                    | Payload                                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server → reader | `RESOURCE_LIST`          | per machine with a running session of the card holder: `canSwitchProject: true`, `ownProjectId` (int or `null`), `ownProjectName` (string or `null`) and `ownSessionContinued` (whether the running record continues a split). Left out when the session has no project and the card holder has none to switch to. |
| Reader → server | `SWITCH_SESSION_PROJECT` | `resourceId`, `usageId` (the running session shown), `mode` (`whole-session` or `split`, required), `projectId` (int, or `null` for no project), `cardSessionId`, `requestId`                                                                                                                                      |
| Server → reader | `SWITCH_SESSION_PROJECT` | `success: true` with `usageId` (the running record: unchanged for `whole-session`, the continuation for `split`) and `projectName` (or `null`), or `error`                                                                                                                                                         |

Error codes: `PROJECT_SWITCH_NOT_SUPPORTED`, `INVALID_PROJECT_ID`, `INVALID_PROJECT_CHANGE_MODE`, `USER_NOT_FOUND`, `INSUFFICIENT_BALANCE` (with `sumUpEnabled`), `METER_SWITCH_FAILED`, `FLOW_EXECUTION_ERROR`, `PROJECT_SWITCH_SESSION_CHANGED` (the named session was split elsewhere and a continuation of the card holder runs), `NoOwnActiveSessionError` (no session of the card holder runs any more); any other refusal carries the server's message. Required forms of the chosen mode go through the same forms exchange as a start. After a refusal the reader receives a fresh row of the resource; after a change, made there or elsewhere, a fresh resource list.

## Regenerating Clients

After making changes to API endpoints, regenerate the client libraries to keep them in sync with the backend. Refer to the project's build scripts for the exact regeneration commands.

## See Also

- [Developer Overview](developer/overview.md) – Getting started
- [Architecture](developer/architecture.md) – Project structure
- [Contributing](developer/contributing.md) – How to contribute
