# Flow Node Types — Domain-First Keys (ATT-335 follow-up)

## Context

The Flow node catalog UI groups nodes into seven domains: `manual`, `resource`, `door`, `mqtt`, `http`, `logic`, `health`. Today the catalog derives the domain from the `ResourceFlowNodeType` string via the `schemaToDomain` helper in `apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.ts`, which sniffs substrings such as `.resource.door.`, `.mqtt.`, `.http.`, `.resource.health.`.

The current node-type strings encode the direction first: `<direction>.<system>.<rest>`, e.g. `input.resource.door.unlocked`, `output.http.sendRequest`, `processing.wait`. No other code paths read the direction segment — it is dead information that forces the catalog to keep a brittle mapper.

This spec replaces the format with `<domain>.<rest>` so the domain is the literal first key, the mapper is deleted, and the casing is normalised to kebab-case.

## Goals

- Domain is the first segment of every `ResourceFlowNodeType` value.
- `schemaToDomain` is deleted; domain derivation becomes `nodeType.split('.', 1)[0] as Domain`.
- TypeScript enum keys are renamed to match the new strings (e.g. `INPUT_RESOURCE_DOOR_UNLOCKED` → `DOOR_UNLOCKED`).
- DB column values are migrated forward and backward via a single TypeORM migration.
- All existing flow runtime, UI, DTO, and metrics behaviour is preserved.

## Non-goals

- No new domains, no new node types, no UI redesign beyond mapper deletion.
- No rename of nested payload data keys (e.g. `health.identifier`, `body`, `topic`).
- No changes to flow execution semantics.
- No changes to plugin or external-event APIs other than the enum value rename.

## Design

### 1. New enum (source of truth)

File: `libs/database-entities/src/lib/entities/resourceFlowNode.ts`

```ts
export enum ResourceFlowNodeType {
  // manual
  MANUAL_BUTTON = 'manual.button',
  // resource
  RESOURCE_USAGE_STARTED = 'resource.usage.started',
  RESOURCE_USAGE_STOPPED = 'resource.usage.stopped',
  RESOURCE_USAGE_TAKEOVER = 'resource.usage.takeover',
  RESOURCE_USAGE_END_SESSION = 'resource.usage.end-session',
  RESOURCE_ACTIVITY_NO_ACTIVITY = 'resource.activity.no-activity',
  RESOURCE_ACTIVITY_TRACK_ACTIVITY = 'resource.activity.track-activity',
  RESOURCE_BILLING_SET_ADDITIONAL_ITEMS = 'resource.billing.set-additional-items',
  // door
  DOOR_UNLOCKED = 'door.unlocked',
  DOOR_LOCKED = 'door.locked',
  DOOR_UNLATCHED = 'door.unlatched',
  // mqtt
  MQTT_MESSAGE_RECEIVED = 'mqtt.message.received',
  MQTT_SEND_MESSAGE = 'mqtt.send-message',
  MQTT_WAIT_FOR_MESSAGE = 'mqtt.wait-for-message',
  // http
  HTTP_SEND_REQUEST = 'http.send-request',
  // logic
  LOGIC_WAIT = 'logic.wait',
  LOGIC_IF = 'logic.if',
  LOGIC_SET_PAYLOAD = 'logic.set-payload',
  LOGIC_ERROR = 'logic.error',
  // health
  HEALTH_HEARTBEAT = 'health.heartbeat',
  HEALTH_SET = 'health.set',
}
```

Enum order matches `DOMAIN_ORDER` from the catalog so iteration order is meaningful.

### 2. Old → New mapping (canonical table)

| Old enum key | Old string | New enum key | New string |
|---|---|---|---|
| `INPUT_BUTTON` | `input.button` | `MANUAL_BUTTON` | `manual.button` |
| `INPUT_RESOURCE_USAGE_STARTED` | `input.resource.usage.started` | `RESOURCE_USAGE_STARTED` | `resource.usage.started` |
| `INPUT_RESOURCE_USAGE_STOPPED` | `input.resource.usage.stopped` | `RESOURCE_USAGE_STOPPED` | `resource.usage.stopped` |
| `INPUT_RESOURCE_USAGE_TAKEOVER` | `input.resource.usage.takeover` | `RESOURCE_USAGE_TAKEOVER` | `resource.usage.takeover` |
| `OUTPUT_RESOURCE_USAGE_END_SESSION` | `output.resource.usage.end-session` | `RESOURCE_USAGE_END_SESSION` | `resource.usage.end-session` |
| `INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY` | `input.resource.activity.no-activity` | `RESOURCE_ACTIVITY_NO_ACTIVITY` | `resource.activity.no-activity` |
| `OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY` | `output.resource.activity.track-activity` | `RESOURCE_ACTIVITY_TRACK_ACTIVITY` | `resource.activity.track-activity` |
| `OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS` | `output.resource.billing.calculation.set-additional-items` | `RESOURCE_BILLING_SET_ADDITIONAL_ITEMS` | `resource.billing.set-additional-items` |
| `INPUT_RESOURCE_DOOR_UNLOCKED` | `input.resource.door.unlocked` | `DOOR_UNLOCKED` | `door.unlocked` |
| `INPUT_RESOURCE_DOOR_LOCKED` | `input.resource.door.locked` | `DOOR_LOCKED` | `door.locked` |
| `INPUT_RESOURCE_DOOR_UNLATCHED` | `input.resource.door.unlatched` | `DOOR_UNLATCHED` | `door.unlatched` |
| `INPUT_MQTT_MESSAGE_RECEIVED` | `input.mqtt.message.received` | `MQTT_MESSAGE_RECEIVED` | `mqtt.message.received` |
| `OUTPUT_MQTT_SEND_MESSAGE` | `output.mqtt.sendMessage` | `MQTT_SEND_MESSAGE` | `mqtt.send-message` |
| `PROCESSING_MQTT_WAIT_FOR_MESSAGE` | `processing.mqtt.waitForMessage` | `MQTT_WAIT_FOR_MESSAGE` | `mqtt.wait-for-message` |
| `OUTPUT_HTTP_SEND_REQUEST` | `output.http.sendRequest` | `HTTP_SEND_REQUEST` | `http.send-request` |
| `PROCESSING_WAIT` | `processing.wait` | `LOGIC_WAIT` | `logic.wait` |
| `PROCESSING_IF` | `processing.if` | `LOGIC_IF` | `logic.if` |
| `PROCESSING_SET_PAYLOAD` | `processing.set-payload` | `LOGIC_SET_PAYLOAD` | `logic.set-payload` |
| `PROCESSING_ERROR` | `processing.error` | `LOGIC_ERROR` | `logic.error` |
| `OUTPUT_RESOURCE_HEALTH_HEARTBEAT` | `output.resource.health.heartbeat` | `HEALTH_HEARTBEAT` | `health.heartbeat` |
| `OUTPUT_RESOURCE_HEALTH_SET` | `output.resource.health.set` | `HEALTH_SET` | `health.set` |

This table is the single source of truth for the migration and the codemod.

### 3. Domain helper

File: `apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.ts`

Replace `schemaToDomain` with:

```ts
export function nodeTypeDomain(nodeType: string): Domain {
  return nodeType.split('.', 1)[0] as Domain;
}
```

Call sites:

- `apps/frontend/src/app/resources/details/flows/nodeCatalog/catalogRow.tsx:22`
- `apps/frontend/src/app/resources/details/flows/nodeCatalog/useNodeCatalog.ts:91`

Both swap `schemaToDomain` → `nodeTypeDomain`. Existing import names updated.

### 4. DB migration

New file: `apps/api/src/database/migrations/<timestamp>-flow-node-domain-first.ts`.

Pattern follows `1755385236330-refactor-resource-flow-type.ts`:

1. `CREATE TABLE temporary_resource_flow_node` with a CHECK constraint enumerating the 21 new values.
2. `SELECT * FROM resource_flow_node`.
3. JS-map each row's `type` field through `OLD_TO_NEW` lookup. Throw on unknown value (no silent data loss).
4. Bulk `INSERT` into temp table.
5. `DROP TABLE resource_flow_node`, then rename temp → real.

`down()` mirrors `up()` using `NEW_TO_OLD` and the old CHECK list. Both directions complete because every old key has a 1:1 new key.

The migration file embeds both lookup tables inline as `const` records — no shared module — so it is self-contained even if the runtime enum changes again later.

### 5. Rename surface (codemod)

Mechanical replace of `ResourceFlowNodeType.<OLD_KEY>` → `ResourceFlowNodeType.<NEW_KEY>` driven by the table in section 2. Affected files (counts from initial blast-radius scan):

- `libs/database-entities/src/lib/entities/resourceFlowNode.ts` — enum definition + `getNodeDataSchema` switch (22 hits)
- `apps/api/src/resources/flows/resource-flows-executor.service.{ts,spec.ts}` (~94 hits)
- `apps/api/src/resources/flows/resource-flows.{service,controller}.ts` and DTOs (~31 hits)
- `apps/api/src/billing/billing.{service,controller}.ts` (~2 hits)
- `apps/api/src/resources/usage/resourceUsage.service.{ts,spec.ts}` (~7 hits)
- `apps/api/src/attractap/websockets/websocket.gateway.ts` (~1 hit)
- `apps/api/src/e2e/migrations-down.e2e.spec.ts` — assert new-shape values for the new migration
- `apps/frontend/src/app/resources/details/flows/node/preview/index.tsx` (~21 hits)
- `apps/frontend/src/app/resources/details/flows/nodeCatalog/{domains,catalogRow,useNodeCatalog}.{ts,tsx}` and tests (~26 hits)

### 6. Generated clients

Regenerate after enum change so values match:

- `libs/react-query-client/src/lib/requests/schemas.gen.ts`
- `libs/react-query-client/src/lib/requests/types.gen.ts`
- `libs/api-client/src/generated/Api.ts`

Use the repo's existing OpenAPI generation script (`nx run ...:generate-api-client` or equivalent — confirm during plan).

### 7. Docs

Update sample node-type strings in:

- `docs/en/monitoring/metrics-reference.md`
- `docs/de/monitoring/metrics-reference.md`
- `docs/en/flows/flow-editor.md` (only if it cites concrete strings — verify during plan)

## Testing

1. **Unit — `domains.test.ts`**: parametrise over every `ResourceFlowNodeType` enum value; assert `nodeTypeDomain(value)` equals `value.split('.')[0]` and is a member of `DOMAIN_ORDER`.
2. **Unit — `getNodeDataSchema`**: keep existing coverage; only enum keys change.
3. **Migration e2e — `migrations-down.e2e.spec.ts`**: extend seed fixture to insert one row per old enum string, run up, assert rows now hold new strings, run down, assert rows revert.
4. **API typecheck**: `nx typecheck api` catches any missed enum-key reference.
5. **Frontend typecheck + Vitest**: `nx typecheck frontend && nx test frontend` catches catalog/preview regressions.
6. **Browser verification (per workspace policy)**: open Flow editor in dev server via `agent-browser`; drop one node from each domain (manual, resource, door, mqtt, http, logic, health); save; reload; confirm nodes persist with new type strings (check via DevTools network or DB inspector). Capture screenshots per affected state and post to Linear issue.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Existing flows in dev/prod break if migration misses a value | Migration throws on unknown old value; e2e covers all 21 entries |
| Generated clients drift from server enum | Regen runs in same PR; CI `nx typecheck` rejects mismatched generated types |
| External Linear PR reviewers expect smaller diff scope | PR description calls out three groups: enum + migration, codemod, generated/docs |
| `schemaToDomain` referenced by future-but-not-yet-merged work | Searched repo at spec time; only catalog code uses it. Re-grep before commit |

## Out of scope (explicit)

- Renaming payload `data` keys (`health.identifier`, `notes`, `entries`, etc.).
- Adding/removing domains in `DOMAIN_ORDER`.
- Changing the UI of the node catalog beyond the helper-name swap.
- Refactoring the flow executor switch statements (they auto-update via key rename).

## Rollout

- Single PR, appended to the open ATT-335 branch (per Q4 = B).
- Reviewer order suggestion: enum + migration first, codemod commit second, regenerated artefacts third — all within the same PR but as separate commits for reviewability.
