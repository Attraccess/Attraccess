# Flow Variables — Design Spec

**Linear issue:** [ATT-278](https://linear.app/attraccess/issue/ATT-278/variables-in-flows)
**GitHub issue:** [Attraccess#750](https://github.com/Attraccess/Attraccess/issues/750)
**Date:** 2026-05-06

## Goal

Add persistent, scoped key/value variables to the resource flow system. Flows can read and write variables, and a new trigger node fires when variables change so flows on different resources can react to one another.

## Requirements (from issue)

1. New nodes to set and get variables; one node can act on multiple variables.
2. Both keys and values are configurable as Handlebars templates (matching existing node template usage).
3. Two access scopes: per-resource and global (across all flows of all resources).
4. Variables are persisted in the database and survive server restarts.
5. New trigger node fires when a variable changes, enabling cross-flow reactions.

## Decisions

| Topic | Decision |
| --- | --- |
| Value type | JSON values (string, number, boolean, object, array, null). |
| Scopes | `resource` and `global`. No execution-only scope. |
| Read paths | Both: a `PROCESSING_GET_VARIABLES` node *and* template access via `{{variables.resource.*}}` / `{{variables.global.*}}`. |
| Change-trigger watches | Multiple `(scope, key)` watches per node; payload contains all watched values plus change meta. |
| Change-trigger source filter | `any` or `exclude-self` (skips events whose source resource is the resource owning this trigger). |
| Change semantics | Fire only when new value differs from previous (deep equal). |
| Event timing | Async via NestJS EventEmitter; current flow continues independent. |
| Deletion | No DELETE node, no TTL. Manual delete via admin modal only. Cascade delete on resource removal for resource-scope vars. |
| Admin UI | Modal opened from flow editor toolbar. No separate page or route. |
| Auth | Same permission gate as flow editing. |

## Data Model

New TypeORM entity in `libs/database-entities/src/lib/entities/resourceFlowVariable.ts`:

```ts
@Entity()
@Unique(['scope', 'resourceId', 'key'])
class ResourceFlowVariable {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar' }) scope: 'resource' | 'global';
  @Column({ type: 'int', nullable: true }) resourceId: number | null;
  @Column({ type: 'varchar' }) key: string;
  @Column({ type: 'text' }) value: string;
  @Column({ type: 'varchar' }) valueType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @ManyToOne(() => Resource, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'resourceId' })
  resource: Resource | null;
}
```

`value` is JSON-stringified at write, parsed at read. `valueType` is derived for UI display. No history table; previous-value lives only in the change event.

A TypeORM migration adds the table with the unique index `(scope, resourceId, key)` and the FK with `ON DELETE CASCADE` for resource-scope rows. Global rows have `resourceId = NULL`.

## New Node Types

Added to `ResourceFlowNodeType` enum in `libs/database-entities/src/lib/entities/resourceFlowNode.ts`:

### `PROCESSING_SET_VARIABLES`

Config (Zod):

```ts
{
  variables: Array<{
    key: string;        // Handlebars template
    value: string;      // Handlebars template; result run through JSON.parse, falls back to string
    scope: 'resource' | 'global';
  }>;
}
```

Each list entry has its own scope, so one node can mix resource-scope and global writes.

### `PROCESSING_GET_VARIABLES`

Config (Zod):

```ts
{
  variables: Array<{
    key: string;        // Handlebars template
    scope: 'resource' | 'global';
    payloadPath: string; // lodash-set target on the flow payload
  }>;
}
```

Missing variables resolve to `undefined` and emit a warning to the flow log.

### `INPUT_VARIABLE_CHANGED`

Config (Zod):

```ts
{
  watches: Array<{ key: string; scope: 'resource' | 'global' }>;
  source: 'any' | 'exclude-self';
}
```

Trigger payload:

```ts
{
  change: {
    scope: 'resource' | 'global';
    key: string;
    previousValue: unknown;
    newValue: unknown;
    changedAt: string;             // ISO timestamp
    sourceResourceId: number | null;
  },
  variables: {
    resource: { [key: string]: unknown };
    global: { [key: string]: unknown };
  }
}
```

`variables` contains current values for *all* watched keys (split by scope), populated at fire time.

`exclude-self`: events whose `sourceResourceId` equals the trigger's resource are dropped. (Note: for trigger nodes that watch only resource-scope vars, `exclude-self` is effectively a no-op since only the same resource can write them — UI should surface this.)

## Backend Services

New `ResourceFlowVariablesService` in `apps/api/src/resources/flows/`:

- `get(scope, resourceId, key) → unknown | undefined`
- `getMany(scope, resourceId, keys[]) → Record<string, unknown>`
- `getAll(resourceId) → { resource: Record<string, unknown>, global: Record<string, unknown> }`
- `set(scope, resourceId, key, value, sourceResourceId)` — upserts. Emits `FlowVariableChangedEvent` if new value differs from prior (deep-equal).
- `delete(scope, resourceId, key)` — admin only.

Event class:

```ts
export class FlowVariableChangedEvent {
  scope: 'resource' | 'global';
  resourceId: number | null;
  key: string;
  previousValue: unknown;
  newValue: unknown;
  changedAt: Date;
  sourceResourceId: number | null;
}
```

Emitted via the existing NestJS `EventEmitter2` instance, event name `flow-variable.changed`.

## Executor Integration

In `apps/api/src/resources/flows/resource-flows-executor.service.ts`:

- At flow execution start, call `getAll(currentResourceId)` and merge into the Handlebars context as `variables.resource` and `variables.global`. Re-fetched on each execution; not cached across executions.
- Add node handlers for `PROCESSING_SET_VARIABLES`, `PROCESSING_GET_VARIABLES`, and `INPUT_VARIABLE_CHANGED`.
  - SET: render templates → attempt `JSON.parse` on rendered value (fallback to raw string) → call `service.set(...)` with `sourceResourceId = currentResourceId`.
  - GET: render keys → fetch via `service.getMany` → `lodash.set(payload, payloadPath, value)` per row.
- New `@OnEvent('flow-variable.changed')` handler in a dedicated subscriber class. For each event, find all `INPUT_VARIABLE_CHANGED` nodes whose `watches` include `(scope, key)`. For each match, evaluate `source` filter (`exclude-self` skips when event `sourceResourceId === node.resourceId`). For surviving matches, compose the trigger payload (including current values of all watched keys) and start flow execution from that node.

## REST API

Controller `apps/api/src/resources/flows/flow-variables.controller.ts`, mounted on `/api/resources/:resourceId/flow-variables`:

- `GET /` — returns combined list: resource-scoped vars for `:resourceId` plus all global vars. Each row tagged with `scope`.
- `PUT /:scope/:key` — body `{ value: <JSON> }`. Upserts. (Used by admin modal.)
- `DELETE /:scope/:key` — deletes the variable.

Auth follows the existing pattern in `resource-flows.controller.ts` (same management permission). Admin writes use the modal-owner resource as `sourceResourceId` for the change event.

## Frontend

- `FlowVariablesModal` component in `apps/frontend/src/app/resources/details/flows/flowVariablesModal/index.tsx`.
- Trigger button added to the flow editor toolbar in `apps/frontend/src/app/resources/details/flows/index.tsx`.
- Modal contents: HeroUI table with columns `scope`, `key`, `value` (JSON-pretty), `valueType`, `updatedAt`, actions (edit / delete).
- Inline create/edit row: scope select, key input, JSON value textarea with `JSON.parse` validation before save.
- Node config UIs auto-render from the new Zod schemas via existing `getNodeSchemas()` flow. A small custom widget renders the per-row scope select inside the SET / GET / `INPUT_VARIABLE_CHANGED` node editors.
- Data layer: react-query hooks generated from the OpenAPI client (existing pattern).

## Testing

**Backend (Jest):**
- `flow-variables.service.spec.ts` — get/set/getMany/getAll/delete; deep-equal change detection; event emission only on real change; cascade delete on resource removal.
- `flow-variables.controller.spec.ts` — REST happy paths + auth + missing key.
- Extensions to `resource-flows-executor.service.spec.ts`:
  - SET node: template rendering, JSON parse fallback, multi-scope mix.
  - GET node: lodash-set into payload, missing-key warning.
  - INPUT_VARIABLE_CHANGED: event filter, `exclude-self`, payload shape.
- Templating test: `{{variables.resource.x}}` and `{{variables.global.y}}` resolution within executor context.

**Frontend (Vitest):**
- `FlowVariablesModal.spec.tsx` — table render, create/edit flow, JSON parse error path.

E2E tests skipped unless existing flow E2E suite easily extends; flagged for follow-up otherwise.

## Out of scope

- DELETE flow node, TTL, scheduled cleanup.
- Variable history / audit log.
- Pattern/glob matching on the change-trigger watch list.
- Top-level admin page (per-flow modal only).
- Concurrency control (last-write-wins on the unique constraint; no explicit locking).

## Open follow-ups

- Document the `exclude-self` no-op caveat for resource-scoped watches in the node UI help text.
- Consider history table later if audit becomes a real ask.
