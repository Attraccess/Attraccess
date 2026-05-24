# Flow Node Domain-First Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `schemaToDomain` mapper by making the catalog domain the first key of every `ResourceFlowNodeType` value, rename TypeScript enum keys to match, and migrate existing DB rows in both directions.

**Architecture:** One TypeORM SQLite migration rebuilds `resource_flow_node` with a new CHECK constraint and rewrites every stored `type` value via a hard-coded `OLD_TO_NEW`/`NEW_TO_OLD` table. The enum in `libs/database-entities` is rewritten in domain order. A mechanical codemod updates every backend consumer; the generated clients are regenerated; the frontend then swaps `schemaToDomain` for a one-line `nodeType.split('.', 1)[0]` reader.

**Tech Stack:** TypeScript, TypeORM (better-sqlite3), NestJS, React + Vitest, Nx monorepo, `openapi-rq` + `swagger-typescript-api` for generated clients.

**Spec:** `docs/superpowers/specs/2026-05-21-flow-node-domain-first-keys-design.md`

**Branch:** `att-335-design-convert-flow-node-editor-node-picker-modals-to` (append commits; no new PR — feeds PR #895).

---

## Critical sequencing constraint

The frontend imports `ResourceFlowNodeType` from `@attraccess/react-query-client` (generated), not from `@attraccess/database-entities` directly. So after renaming the source-of-truth enum, **the generated clients MUST be regenerated before any frontend codemod or frontend test run**, otherwise the frontend sees the old enum values and tests fail confusingly.

Task order honours this: Migration → backend rename + API codemod → regen → frontend codemod + helper swap → lookup test → docs → browser verification.

## Commit cadence

The repo's `precommit` hook runs `nx affected --uncommitted --nxBail --target=lint,typecheck,build,test,e2e`. Workspace policy forbids `--no-verify`. Tasks 2 and 3 each leave the tree in an intermediate state where frontend typecheck would fail (Task 2: rqc still ships old values; Task 3: rqc updated but frontend not codemodded yet). To stay green:

- Execute steps 2.x, 3.x, and 4.x as one continuous session **without committing** until the end of Task 4. Stage with `git add -N` if you want to track progress without commits.
- At the end of Task 4 step 4.7 (all frontend tests green), make **one bundled commit** covering all of Tasks 2+3+4 — see the modified commit step at 4.8.
- Tasks 1, 5, 6 each commit independently and stay green on their own.

## File structure

| Path | Change | Responsibility |
|---|---|---|
| `libs/database-entities/src/lib/entities/resourceFlowNode.ts` | Modify | Enum source of truth + `getNodeDataSchema` switch |
| `apps/api/src/database/migrations/<ts>-flow-node-domain-first.ts` | Create | SQLite CHECK rebuild + bidirectional row rewrite, with exported `OLD_TO_NEW`/`NEW_TO_OLD` |
| `apps/api/src/database/migrations/__tests__/flow-node-domain-first.spec.ts` | Create | Unit test asserting lookup tables are exhaustive |
| Backend consumer files (15) | Modify | Codemod `ResourceFlowNodeType.OLD_KEY` → `NEW_KEY` |
| `libs/react-query-client/src/lib/requests/{schemas,types}.gen.ts` | Regenerate | OpenAPI output |
| `libs/api-client/src/generated/Api.ts` | Regenerate | OpenAPI output |
| `apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.ts` | Modify | Replace `schemaToDomain` with `nodeTypeDomain` |
| `apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.test.ts` | Modify | Test new helper against new enum values |
| `apps/frontend/src/app/resources/details/flows/nodeCatalog/{catalogRow.tsx,useNodeCatalog.ts}` | Modify | Swap helper import |
| Frontend consumer files (4) | Modify | Codemod enum-key references |
| `docs/{en,de}/monitoring/metrics-reference.md` | Modify | Sample node-type strings |

## Canonical OLD → NEW table (referenced by every task)

```ts
const OLD_TO_NEW: Record<string, string> = {
  'input.button':                                              'manual.button',
  'input.resource.usage.started':                              'resource.usage.started',
  'input.resource.usage.stopped':                              'resource.usage.stopped',
  'input.resource.usage.takeover':                             'resource.usage.takeover',
  'output.resource.usage.end-session':                         'resource.usage.end-session',
  'input.resource.activity.no-activity':                       'resource.activity.no-activity',
  'output.resource.activity.track-activity':                   'resource.activity.track-activity',
  'output.resource.billing.calculation.set-additional-items':  'resource.billing.set-additional-items',
  'input.resource.door.unlocked':                              'door.unlocked',
  'input.resource.door.locked':                                'door.locked',
  'input.resource.door.unlatched':                             'door.unlatched',
  'input.mqtt.message.received':                               'mqtt.message.received',
  'output.mqtt.sendMessage':                                   'mqtt.send-message',
  'processing.mqtt.waitForMessage':                            'mqtt.wait-for-message',
  'output.http.sendRequest':                                   'http.send-request',
  'processing.wait':                                           'logic.wait',
  'processing.if':                                             'logic.if',
  'processing.set-payload':                                    'logic.set-payload',
  'processing.error':                                          'logic.error',
  'output.resource.health.heartbeat':                          'health.heartbeat',
  'output.resource.health.set':                                'health.set',
};
```

Enum-key rename map:

| Old key | New key |
|---|---|
| `INPUT_BUTTON` | `MANUAL_BUTTON` |
| `INPUT_RESOURCE_USAGE_STARTED` | `RESOURCE_USAGE_STARTED` |
| `INPUT_RESOURCE_USAGE_STOPPED` | `RESOURCE_USAGE_STOPPED` |
| `INPUT_RESOURCE_USAGE_TAKEOVER` | `RESOURCE_USAGE_TAKEOVER` |
| `OUTPUT_RESOURCE_USAGE_END_SESSION` | `RESOURCE_USAGE_END_SESSION` |
| `INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY` | `RESOURCE_ACTIVITY_NO_ACTIVITY` |
| `OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY` | `RESOURCE_ACTIVITY_TRACK_ACTIVITY` |
| `OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS` | `RESOURCE_BILLING_SET_ADDITIONAL_ITEMS` |
| `INPUT_RESOURCE_DOOR_UNLOCKED` | `DOOR_UNLOCKED` |
| `INPUT_RESOURCE_DOOR_LOCKED` | `DOOR_LOCKED` |
| `INPUT_RESOURCE_DOOR_UNLATCHED` | `DOOR_UNLATCHED` |
| `INPUT_MQTT_MESSAGE_RECEIVED` | `MQTT_MESSAGE_RECEIVED` |
| `OUTPUT_MQTT_SEND_MESSAGE` | `MQTT_SEND_MESSAGE` |
| `PROCESSING_MQTT_WAIT_FOR_MESSAGE` | `MQTT_WAIT_FOR_MESSAGE` |
| `OUTPUT_HTTP_SEND_REQUEST` | `HTTP_SEND_REQUEST` |
| `PROCESSING_WAIT` | `LOGIC_WAIT` |
| `PROCESSING_IF` | `LOGIC_IF` |
| `PROCESSING_SET_PAYLOAD` | `LOGIC_SET_PAYLOAD` |
| `PROCESSING_ERROR` | `LOGIC_ERROR` |
| `OUTPUT_RESOURCE_HEALTH_HEARTBEAT` | `HEALTH_HEARTBEAT` |
| `OUTPUT_RESOURCE_HEALTH_SET` | `HEALTH_SET` |

A reusable sed block (`SED_RENAME`) is referenced from multiple tasks:

```
SED_RENAME=(
  -e 's/ResourceFlowNodeType\.INPUT_BUTTON\b/ResourceFlowNodeType.MANUAL_BUTTON/g'
  -e 's/ResourceFlowNodeType\.INPUT_RESOURCE_USAGE_STARTED\b/ResourceFlowNodeType.RESOURCE_USAGE_STARTED/g'
  -e 's/ResourceFlowNodeType\.INPUT_RESOURCE_USAGE_STOPPED\b/ResourceFlowNodeType.RESOURCE_USAGE_STOPPED/g'
  -e 's/ResourceFlowNodeType\.INPUT_RESOURCE_USAGE_TAKEOVER\b/ResourceFlowNodeType.RESOURCE_USAGE_TAKEOVER/g'
  -e 's/ResourceFlowNodeType\.OUTPUT_RESOURCE_USAGE_END_SESSION\b/ResourceFlowNodeType.RESOURCE_USAGE_END_SESSION/g'
  -e 's/ResourceFlowNodeType\.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY\b/ResourceFlowNodeType.RESOURCE_ACTIVITY_NO_ACTIVITY/g'
  -e 's/ResourceFlowNodeType\.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY\b/ResourceFlowNodeType.RESOURCE_ACTIVITY_TRACK_ACTIVITY/g'
  -e 's/ResourceFlowNodeType\.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS\b/ResourceFlowNodeType.RESOURCE_BILLING_SET_ADDITIONAL_ITEMS/g'
  -e 's/ResourceFlowNodeType\.INPUT_RESOURCE_DOOR_UNLOCKED\b/ResourceFlowNodeType.DOOR_UNLOCKED/g'
  -e 's/ResourceFlowNodeType\.INPUT_RESOURCE_DOOR_LOCKED\b/ResourceFlowNodeType.DOOR_LOCKED/g'
  -e 's/ResourceFlowNodeType\.INPUT_RESOURCE_DOOR_UNLATCHED\b/ResourceFlowNodeType.DOOR_UNLATCHED/g'
  -e 's/ResourceFlowNodeType\.INPUT_MQTT_MESSAGE_RECEIVED\b/ResourceFlowNodeType.MQTT_MESSAGE_RECEIVED/g'
  -e 's/ResourceFlowNodeType\.OUTPUT_MQTT_SEND_MESSAGE\b/ResourceFlowNodeType.MQTT_SEND_MESSAGE/g'
  -e 's/ResourceFlowNodeType\.PROCESSING_MQTT_WAIT_FOR_MESSAGE\b/ResourceFlowNodeType.MQTT_WAIT_FOR_MESSAGE/g'
  -e 's/ResourceFlowNodeType\.OUTPUT_HTTP_SEND_REQUEST\b/ResourceFlowNodeType.HTTP_SEND_REQUEST/g'
  -e 's/ResourceFlowNodeType\.PROCESSING_WAIT\b/ResourceFlowNodeType.LOGIC_WAIT/g'
  -e 's/ResourceFlowNodeType\.PROCESSING_IF\b/ResourceFlowNodeType.LOGIC_IF/g'
  -e 's/ResourceFlowNodeType\.PROCESSING_SET_PAYLOAD\b/ResourceFlowNodeType.LOGIC_SET_PAYLOAD/g'
  -e 's/ResourceFlowNodeType\.PROCESSING_ERROR\b/ResourceFlowNodeType.LOGIC_ERROR/g'
  -e 's/ResourceFlowNodeType\.OUTPUT_RESOURCE_HEALTH_HEARTBEAT\b/ResourceFlowNodeType.HEALTH_HEARTBEAT/g'
  -e 's/ResourceFlowNodeType\.OUTPUT_RESOURCE_HEALTH_SET\b/ResourceFlowNodeType.HEALTH_SET/g'
)
```

Apply with: `sed -i.bak "${SED_RENAME[@]}" "$file" && rm "$file.bak"`.

---

### Task 1: Bidirectional DB migration

**Files:**
- Create: `apps/api/src/database/migrations/<TS>-flow-node-domain-first.ts`

Migration is self-contained (raw strings, no enum import). Ships first so devs running `pull && nx run api:migrate` get the new CHECK constraint before code expects new values.

- [ ] **Step 1.1: Inspect prior-art migration**

Run:
```
sed -n '1,90p' apps/api/src/database/migrations/1755385236330-refactor-resource-flow-type.ts
```
Confirm the temp-table-create + per-row JS-rewrite + drop + rename pattern.

- [ ] **Step 1.2: Pick a timestamp**

Run:
```
node -e "console.log(Date.now())"
```
Record the integer as `TS` (must be greater than `1777217977658`, which is the latest existing migration). Used three times below: filename prefix, class name suffix, `name` property.

- [ ] **Step 1.3: Create the migration file**

Path: `apps/api/src/database/migrations/<TS>-flow-node-domain-first.ts` (substitute the integer).

Contents (every `__TS__` token must be replaced with the same integer):

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export const OLD_TO_NEW: Record<string, string> = {
  'input.button':                                              'manual.button',
  'input.resource.usage.started':                              'resource.usage.started',
  'input.resource.usage.stopped':                              'resource.usage.stopped',
  'input.resource.usage.takeover':                             'resource.usage.takeover',
  'output.resource.usage.end-session':                         'resource.usage.end-session',
  'input.resource.activity.no-activity':                       'resource.activity.no-activity',
  'output.resource.activity.track-activity':                   'resource.activity.track-activity',
  'output.resource.billing.calculation.set-additional-items':  'resource.billing.set-additional-items',
  'input.resource.door.unlocked':                              'door.unlocked',
  'input.resource.door.locked':                                'door.locked',
  'input.resource.door.unlatched':                             'door.unlatched',
  'input.mqtt.message.received':                               'mqtt.message.received',
  'output.mqtt.sendMessage':                                   'mqtt.send-message',
  'processing.mqtt.waitForMessage':                            'mqtt.wait-for-message',
  'output.http.sendRequest':                                   'http.send-request',
  'processing.wait':                                           'logic.wait',
  'processing.if':                                             'logic.if',
  'processing.set-payload':                                    'logic.set-payload',
  'processing.error':                                          'logic.error',
  'output.resource.health.heartbeat':                          'health.heartbeat',
  'output.resource.health.set':                                'health.set',
};

export const NEW_TO_OLD: Record<string, string> = Object.fromEntries(
  Object.entries(OLD_TO_NEW).map(([oldType, newType]) => [newType, oldType]),
);

const NEW_CHECK = Object.values(OLD_TO_NEW).map((v) => `'${v}'`).join(',');
const OLD_CHECK = Object.keys(OLD_TO_NEW).map((v) => `'${v}'`).join(',');
const FK_NODE_RESOURCE = 'FK_ca3080b2dbc9c7c88a4a64c469d';

function escape(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

export class FlowNodeDomainFirst__TS__ implements MigrationInterface {
  name = 'FlowNodeDomainFirst__TS__';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.rewrite(queryRunner, OLD_TO_NEW, NEW_CHECK);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rewrite(queryRunner, NEW_TO_OLD, OLD_CHECK);
  }

  private async rewrite(
    queryRunner: QueryRunner,
    map: Record<string, string>,
    check: string,
  ): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN (${check}) ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "${FK_NODE_RESOURCE}" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );

    const nodes: Array<{
      id: string;
      type: string;
      data: unknown;
      createdAt: string;
      updatedAt: string;
      resourceId: number;
      positionX: number;
      positionY: number;
    }> = await queryRunner.query(`SELECT * FROM "resource_flow_node"`);

    if (nodes.length > 0) {
      const rewritten = nodes.map((node) => {
        const next = map[node.type];
        if (!next) {
          throw new Error(`FlowNodeDomainFirst: unknown node type "${node.type}" in row ${node.id}`);
        }
        return { ...node, type: next };
      });

      const values = rewritten
        .map(
          (n) =>
            `(${escape(n.id)}, ${escape(n.type)}, ${escape(typeof n.data === 'string' ? n.data : JSON.stringify(n.data))}, ${escape(n.createdAt)}, ${escape(n.updatedAt)}, ${escape(n.resourceId)}, ${escape(n.positionX)}, ${escape(n.positionY)})`,
        )
        .join(',');

      await queryRunner.query(
        `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") VALUES ${values}`,
      );
    }

    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);
  }
}
```

- [ ] **Step 1.4: Round-trip the migration in a scratch DB**

Run:
```
pnpm nx run api:migrate
pnpm nx run api:migrate:revert
pnpm nx run api:migrate
```
Expected: all three commands exit 0; final log mentions `FlowNodeDomainFirst<TS>` for the up.

- [ ] **Step 1.5: Commit**

```
git add apps/api/src/database/migrations/<TS>-flow-node-domain-first.ts
git commit -m "feat(api): migrate resource_flow_node type to domain-first keys (ATT-335)"
```

---

### Task 2: Rename enum + API consumer codemod

**Files:**
- Modify: `libs/database-entities/src/lib/entities/resourceFlowNode.ts`
- Modify (codemod): every backend file that references `ResourceFlowNodeType.<OLD_KEY>`:
  - `apps/api/src/resources/flows/resource-flows.service.ts`
  - `apps/api/src/resources/flows/resource-flows.controller.ts`
  - `apps/api/src/resources/flows/resource-flows-executor.service.ts`
  - `apps/api/src/resources/flows/resource-flows-executor.service.spec.ts`
  - `apps/api/src/resources/flows/resource-flows-executor-event-handler.spec.ts`
  - `apps/api/src/resources/flows/dto/resource-flow-node.dto.ts`
  - `apps/api/src/resources/flows/dto/resource-flow-save.dto.ts`
  - `apps/api/src/resources/flows/dto/resource-flow-response.dto.ts`
  - `apps/api/src/resources/flows/dto/resource-flow-node-schemas-response.dto.ts`
  - `apps/api/src/resources/usage/resourceUsage.service.ts`
  - `apps/api/src/resources/usage/resourceUsage.service.spec.ts`
  - `apps/api/src/billing/billing.service.ts`
  - `apps/api/src/billing/billing.controller.ts`
  - `apps/api/src/attractap/websockets/websocket.gateway.ts`
  - `apps/api/src/metrics/instrumentation/flow/flow.helper.spec.ts`
  - `apps/api/src/e2e/migrations-down.e2e.spec.ts`

- [ ] **Step 2.1: Rewrite the enum**

Replace lines 7-29 of `libs/database-entities/src/lib/entities/resourceFlowNode.ts` with:

```ts
export enum ResourceFlowNodeType {
  MANUAL_BUTTON = 'manual.button',
  RESOURCE_USAGE_STARTED = 'resource.usage.started',
  RESOURCE_USAGE_STOPPED = 'resource.usage.stopped',
  RESOURCE_USAGE_TAKEOVER = 'resource.usage.takeover',
  RESOURCE_USAGE_END_SESSION = 'resource.usage.end-session',
  RESOURCE_ACTIVITY_NO_ACTIVITY = 'resource.activity.no-activity',
  RESOURCE_ACTIVITY_TRACK_ACTIVITY = 'resource.activity.track-activity',
  RESOURCE_BILLING_SET_ADDITIONAL_ITEMS = 'resource.billing.set-additional-items',
  DOOR_UNLOCKED = 'door.unlocked',
  DOOR_LOCKED = 'door.locked',
  DOOR_UNLATCHED = 'door.unlatched',
  MQTT_MESSAGE_RECEIVED = 'mqtt.message.received',
  MQTT_SEND_MESSAGE = 'mqtt.send-message',
  MQTT_WAIT_FOR_MESSAGE = 'mqtt.wait-for-message',
  HTTP_SEND_REQUEST = 'http.send-request',
  LOGIC_WAIT = 'logic.wait',
  LOGIC_IF = 'logic.if',
  LOGIC_SET_PAYLOAD = 'logic.set-payload',
  LOGIC_ERROR = 'logic.error',
  HEALTH_HEARTBEAT = 'health.heartbeat',
  HEALTH_SET = 'health.set',
}
```

- [ ] **Step 2.2: Rewrite `getNodeDataSchema` switch**

In the same file, replace the entire `getNodeDataSchema` function (was lines 181-241) with:

```ts
export function getNodeDataSchema(nodeType: ResourceFlowNodeType) {
  switch (nodeType) {
    case ResourceFlowNodeType.MANUAL_BUTTON:
      return ButtonNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_USAGE_STARTED:
    case ResourceFlowNodeType.RESOURCE_USAGE_STOPPED:
    case ResourceFlowNodeType.RESOURCE_USAGE_TAKEOVER:
    case ResourceFlowNodeType.DOOR_UNLOCKED:
    case ResourceFlowNodeType.DOOR_LOCKED:
    case ResourceFlowNodeType.DOOR_UNLATCHED:
      return EventNodeDataSchema;

    case ResourceFlowNodeType.MQTT_MESSAGE_RECEIVED:
      return MqttMessageReceivedNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_ACTIVITY_NO_ACTIVITY:
      return InputResourceActivityNoActivityNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
      return BillingTransactionItemCreateSchema;

    case ResourceFlowNodeType.HTTP_SEND_REQUEST:
      return HttpRequestNodeDataSchema;

    case ResourceFlowNodeType.MQTT_SEND_MESSAGE:
      return MqttSendMessageNodeDataSchema;

    case ResourceFlowNodeType.LOGIC_WAIT:
      return WaitNodeDataSchema;

    case ResourceFlowNodeType.LOGIC_IF:
      return IfNodeDataSchema;

    case ResourceFlowNodeType.LOGIC_SET_PAYLOAD:
      return SetPayloadNodeDataSchema;

    case ResourceFlowNodeType.MQTT_WAIT_FOR_MESSAGE:
      return MqttWaitForMessageNodeDataSchema;

    case ResourceFlowNodeType.LOGIC_ERROR:
      return ErrorNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_USAGE_END_SESSION:
      return ResourceUsageEndSessionNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_ACTIVITY_TRACK_ACTIVITY:
      return ResourceActivityTrackActivityNodeDataSchema;

    case ResourceFlowNodeType.HEALTH_HEARTBEAT:
      return ResourceHealthHeartbeatNodeDataSchema;

    case ResourceFlowNodeType.HEALTH_SET:
      return ResourceHealthSetNodeDataSchema;

    default: {
      const exhaustiveCheck: never = nodeType;
      throw new Error(`Unknown node type: ${exhaustiveCheck}`);
    }
  }
}
```

Also update the `@ApiProperty` example on lines 273-274: change `ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED` to `ResourceFlowNodeType.RESOURCE_USAGE_STARTED`.

- [ ] **Step 2.3: Codemod backend consumers**

Paste the `SED_RENAME` definition from the canonical block at the top of the plan into your shell, then run:

```
for f in \
  apps/api/src/resources/flows/resource-flows.service.ts \
  apps/api/src/resources/flows/resource-flows.controller.ts \
  apps/api/src/resources/flows/resource-flows-executor.service.ts \
  apps/api/src/resources/flows/resource-flows-executor.service.spec.ts \
  apps/api/src/resources/flows/resource-flows-executor-event-handler.spec.ts \
  apps/api/src/resources/flows/dto/resource-flow-node.dto.ts \
  apps/api/src/resources/flows/dto/resource-flow-save.dto.ts \
  apps/api/src/resources/flows/dto/resource-flow-response.dto.ts \
  apps/api/src/resources/flows/dto/resource-flow-node-schemas-response.dto.ts \
  apps/api/src/resources/usage/resourceUsage.service.ts \
  apps/api/src/resources/usage/resourceUsage.service.spec.ts \
  apps/api/src/billing/billing.service.ts \
  apps/api/src/billing/billing.controller.ts \
  apps/api/src/attractap/websockets/websocket.gateway.ts \
  apps/api/src/metrics/instrumentation/flow/flow.helper.spec.ts \
  apps/api/src/e2e/migrations-down.e2e.spec.ts ; do
  sed -i.bak "${SED_RENAME[@]}" "$f" && rm "$f.bak"
done
```

- [ ] **Step 2.4: Find missed string literals**

Some specs hard-code raw type strings like `'input.button'`. Find them:

```
git grep -nE "'(input|output|processing)\." apps/api
```

For each hit, replace the literal with the equivalent new value from the canonical OLD_TO_NEW table (or with the appropriate `ResourceFlowNodeType.<NEW_KEY>` reference where idiomatic).

Re-run after edits — expected: no output.

Also catch leftover enum references the sed missed:

```
git grep -nE "ResourceFlowNodeType\.(INPUT|OUTPUT|PROCESSING)_" apps/api libs
```
Expected: no output. Edit any hits by hand.

- [ ] **Step 2.5: Typecheck + test API**

Run:
```
pnpm nx typecheck api database-entities
pnpm nx test api
```
Expected: both green. The `getNodeDataSchema` exhaustive-`never` check will catch any missing case branch.

- [ ] **Step 2.6: DO NOT COMMIT YET**

Stop here without committing — the repo would fail precommit because the regenerated clients (Task 3) are not in place yet, and frontend (still on old keys) would fail typecheck. Leave changes staged via `git add libs/database-entities apps/api` and continue straight into Task 3.

---

### Task 3: Regenerate API clients

**Files (regenerated, do not hand-edit):**
- `libs/react-query-client/src/lib/requests/schemas.gen.ts`
- `libs/react-query-client/src/lib/requests/types.gen.ts`
- `libs/api-client/src/generated/Api.ts`

- [ ] **Step 3.1: Re-export Swagger from the API**

Run:
```
pnpm nx run api:export-swagger
```
Expected: writes `dist/apps/api-swagger/swagger.json` containing the new enum values; exit 0.

Sanity-check the output:
```
grep -o "\"manual.button\"" dist/apps/api-swagger/swagger.json
```
Expected: at least one hit.

- [ ] **Step 3.2: Regenerate the react-query client**

Run:
```
pnpm nx run react-query-client:generate
```
Expected: rewrites files under `libs/react-query-client/src/lib/`. The `ResourceFlowNodeType` string enum in `schemas.gen.ts` / `types.gen.ts` now contains values `manual.button` … `health.set`.

- [ ] **Step 3.3: Regenerate the api-client**

Run:
```
pnpm nx build api-client
```
Verify `libs/api-client/src/generated/Api.ts` now lists new enum values.

- [ ] **Step 3.4: Verify no old strings remain**

Run:
```
git grep -nE "'(input|output|processing)\." -- 'libs/react-query-client/**' 'libs/api-client/**'
```
Expected: no output.

```
pnpm nx typecheck react-query-client api-client
```
Expected: green.

- [ ] **Step 3.5: DO NOT COMMIT YET**

Stop here without committing — frontend still references old enum keys. Stage with `git add libs/react-query-client/src/lib libs/api-client/src/generated` and continue into Task 4.

---

### Task 4: Frontend codemod + replace `schemaToDomain`

**Files:**
- Modify (codemod): every frontend file that references `ResourceFlowNodeType.<OLD_KEY>`:
  - `apps/frontend/src/app/resources/details/flows/node/preview/index.tsx`
  - `apps/frontend/src/app/resources/details/flows/nodeCatalog/catalogRow.test.tsx`
  - `apps/frontend/src/app/resources/details/flows/nodeCatalog/index.test.tsx`
  - `apps/frontend/src/app/resources/details/flows/nodeCatalog/useNodeCatalog.test.ts`
- Modify: `apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.ts`
- Modify: `apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.test.ts`
- Modify: `apps/frontend/src/app/resources/details/flows/nodeCatalog/catalogRow.tsx`
- Modify: `apps/frontend/src/app/resources/details/flows/nodeCatalog/useNodeCatalog.ts`

- [ ] **Step 4.1: Codemod enum references**

Paste `SED_RENAME` from the canonical block, then run:

```
for f in \
  apps/frontend/src/app/resources/details/flows/node/preview/index.tsx \
  apps/frontend/src/app/resources/details/flows/nodeCatalog/catalogRow.test.tsx \
  apps/frontend/src/app/resources/details/flows/nodeCatalog/index.test.tsx \
  apps/frontend/src/app/resources/details/flows/nodeCatalog/useNodeCatalog.test.ts ; do
  sed -i.bak "${SED_RENAME[@]}" "$f" && rm "$f.bak"
done
```

- [ ] **Step 4.2: Find missed string literals**

Run:
```
git grep -nE "'(input|output|processing)\." apps/frontend
```
Edit each hit by hand using the canonical OLD → NEW table.

```
git grep -nE "ResourceFlowNodeType\.(INPUT|OUTPUT|PROCESSING)_" apps/frontend
```
Expected: no output.

- [ ] **Step 4.3: Rewrite the helper test (red)**

Replace the entire body of `apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.test.ts` with:

```ts
// Tests for domain mapping: nodeTypeDomain, DOMAINS, and DOMAIN_ORDER
// FEATURE: Node catalog redesign — domain grouping
import { describe, expect, it } from 'vitest';
import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { DOMAINS, DOMAIN_ORDER, nodeTypeDomain, type Domain } from './domains';

describe('nodeTypeDomain', () => {
  it.each(Object.values(ResourceFlowNodeType))('returns first segment for %s', (nodeType) => {
    const expected = nodeType.split('.')[0] as Domain;
    expect(nodeTypeDomain(nodeType)).toBe(expected);
    expect(DOMAIN_ORDER).toContain(expected);
  });
});

describe('DOMAINS', () => {
  it('defines an entry for every domain in DOMAIN_ORDER', () => {
    for (const domain of DOMAIN_ORDER) {
      expect(DOMAINS[domain]).toBeDefined();
    }
  });
});
```

Run:
```
pnpm nx test frontend -- --runTestsByPath apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.test.ts
```
Expected: FAIL — `nodeTypeDomain` not exported yet.

- [ ] **Step 4.4: Replace the helper (green)**

Edit `apps/frontend/src/app/resources/details/flows/nodeCatalog/domains.ts`. Delete `schemaToDomain` (was lines 36-44) AND the now-unused `ResourceFlowNodeType` import on line 4. Append:

```ts
export function nodeTypeDomain(nodeType: string): Domain {
  return nodeType.split('.', 1)[0] as Domain;
}
```

Re-run the test from step 4.3. Expected: PASS.

- [ ] **Step 4.5: Update call sites**

`apps/frontend/src/app/resources/details/flows/nodeCatalog/catalogRow.tsx`:
- Line 7: `import { DOMAINS, schemaToDomain } from './domains';` → `import { DOMAINS, nodeTypeDomain } from './domains';`
- Line 22: `const domain = schemaToDomain(node.schema.type);` → `const domain = nodeTypeDomain(node.schema.type);`

`apps/frontend/src/app/resources/details/flows/nodeCatalog/useNodeCatalog.ts`:
- Line 5: `import { Domain, DOMAIN_ORDER, schemaToDomain } from './domains';` → `import { Domain, DOMAIN_ORDER, nodeTypeDomain } from './domains';`
- Line 91: `const domain = schemaToDomain(schema.type);` → `const domain = nodeTypeDomain(schema.type);`

- [ ] **Step 4.6: Verify mapper truly gone**

Run:
```
git grep -n "schemaToDomain"
```
Expected: no output.

- [ ] **Step 4.7: Typecheck + test frontend**

Run:
```
pnpm nx typecheck frontend
pnpm nx test frontend
```
Expected: both green.

- [ ] **Step 4.8: Run the full affected suite, then commit Tasks 2+3+4 as one**

Run:
```
pnpm nx affected --target=lint,typecheck,build,test --uncommitted --nxBail
```
Expected: green. If anything fails, fix in place (do NOT split commits — the staged tree is the unit of consistency).

Then:
```
git add libs/database-entities apps/api libs/react-query-client/src/lib libs/api-client/src/generated apps/frontend
git commit -m "$(cat <<'EOF'
refactor: rename flow node types to domain-first keys (ATT-335)

* libs/database-entities: rewrite ResourceFlowNodeType enum so the
  catalog domain is the first segment of every value; update
  getNodeDataSchema switch + @ApiProperty examples.
* apps/api: codemod all consumers (flows, billing, usage, attractap,
  metrics, e2e migrations spec).
* libs/react-query-client, libs/api-client: regenerate from new
  Swagger.
* apps/frontend: codemod consumers + replace schemaToDomain mapper
  with one-line nodeTypeDomain helper.
EOF
)"
```
Expected: precommit hook runs `nx affected` again and stays green.

---

### Task 5: Migration lookup unit test

**Files:**
- Create: `apps/api/src/database/migrations/__tests__/flow-node-domain-first.spec.ts`
- Modify: the migration file from Task 1 (already exports lookup tables — confirm)

- [ ] **Step 5.1: Confirm exports**

The migration in Task 1 already declares `export const OLD_TO_NEW` and `export const NEW_TO_OLD`. Verify:

```
grep -n "^export const" apps/api/src/database/migrations/<TS>-flow-node-domain-first.ts
```
Expected: two hits. If missing, add `export` and re-commit (or amend Task 1's commit if not yet pushed).

- [ ] **Step 5.2: Write the unit test**

Create `apps/api/src/database/migrations/__tests__/flow-node-domain-first.spec.ts` (replace `<TS>` with the actual integer):

```ts
import { describe, expect, it } from '@jest/globals';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { OLD_TO_NEW, NEW_TO_OLD } from '../<TS>-flow-node-domain-first';

describe('FlowNodeDomainFirst migration lookup tables', () => {
  it('OLD_TO_NEW values cover every current ResourceFlowNodeType value', () => {
    const newValues = Object.values(OLD_TO_NEW).sort();
    const enumValues = Object.values(ResourceFlowNodeType).sort();
    expect(newValues).toEqual(enumValues);
  });

  it('NEW_TO_OLD is the inverse of OLD_TO_NEW', () => {
    for (const [oldType, newType] of Object.entries(OLD_TO_NEW)) {
      expect(NEW_TO_OLD[newType]).toBe(oldType);
    }
    expect(Object.keys(NEW_TO_OLD).length).toBe(Object.keys(OLD_TO_NEW).length);
  });
});
```

- [ ] **Step 5.3: Run the unit + the existing migrations-down e2e**

Run:
```
pnpm nx test api -- --testPathPattern=flow-node-domain-first
pnpm nx e2e api -- --testPathPattern=migrations-down
```
Expected: both pass. The existing `seedDatabase` in `migrations-down.e2e.spec.ts:331` inserts one `ResourceFlowNode` (codemod made it `RESOURCE_USAGE_STARTED` in Task 2) — that single row already exercises the migration's per-row loop end-to-end.

If the unit fails with a value mismatch, reconcile against the canonical OLD_TO_NEW table — the mismatch surfaces a typo introduced in either Task 1 or Task 2.

- [ ] **Step 5.4: Commit**

```
git add apps/api/src/database/migrations/__tests__/flow-node-domain-first.spec.ts
git commit -m "test(api): assert FlowNodeDomainFirst lookup is exhaustive (ATT-335)"
```

---

### Task 6: Update metric docs

**Files:**
- Modify: `docs/en/monitoring/metrics-reference.md`
- Modify: `docs/de/monitoring/metrics-reference.md`

- [ ] **Step 6.1: Find affected lines**

Run:
```
git grep -nE "(input|output|processing)\." docs/en/monitoring/metrics-reference.md docs/de/monitoring/metrics-reference.md
```
Note each hit.

- [ ] **Step 6.2: Rewrite samples**

For each hit, replace the sample node-type string using the canonical OLD → NEW table (e.g. `output.http.sendRequest` → `http.send-request`, `input.resource.usage.started` → `resource.usage.started`).

- [ ] **Step 6.3: Verify**

Re-run the grep from step 6.1. Expected: only URL fragments or non-node-type tokens remain.

- [ ] **Step 6.4: Commit**

```
git add docs/en/monitoring/metrics-reference.md docs/de/monitoring/metrics-reference.md
git commit -m "docs: update flow node-type samples to domain-first keys (ATT-335)"
```

---

### Task 7: Browser verification + Linear screenshots

**Files:** None edited; verification only.

Mandated by workspace agent guidance for any frontend-visible change.

- [ ] **Step 7.1: Load the agent-browser core skill**

Run `agent-browser skills get core` per workspace policy. Do not skip; do not guess commands from memory.

- [ ] **Step 7.2: Start the API + frontend in dev mode**

Run, in two terminals or as background processes:
```
pnpm nx serve api
pnpm nx serve frontend
```
Wait for both to log "ready". The API auto-runs pending migrations on boot in dev.

- [ ] **Step 7.3: Open the flow editor for a test resource**

In a tab driven by `agent-browser`, navigate to a Resource's Flow editor page. Open the node-catalog drawer / panel.

- [ ] **Step 7.4: Drop one node per domain**

For each of `manual`, `resource`, `door`, `mqtt`, `http`, `logic`, `health`: drag one node from the catalog onto the canvas. Save the flow.

- [ ] **Step 7.5: Reload and verify persistence**

Reload the page. Confirm every dropped node renders with its label + icon intact. Open DevTools Network or hit the API directly to inspect a `GET /api/resources/:id/flow` response; every `node.type` must use the new `<domain>.<rest>` format.

- [ ] **Step 7.6: Capture screenshots**

Capture at minimum:
1. Flow editor with the catalog drawer open, showing all seven domain headers.
2. Canvas after dropping one node from each domain.
3. The same canvas after reload (proving persistence).
4. A DevTools Network panel (or curl output) showing one persisted node type using the new string format.

- [ ] **Step 7.7: Post to Linear**

Add a comment on issue ATT-335 with the screenshots and short captions for each. State explicitly: "Domain-first node types verified end-to-end."

- [ ] **Step 7.8: Push branch + update PR #895**

Run:
```
git push
```
PR #895 (`att-335-design-...`) picks up the new commits automatically. Update the PR description to add a "Domain-first rename" section listing this plan's commits and link this plan file.

---

## Verification matrix

| Spec requirement | Plan task |
|---|---|
| Domain is first segment of every value | Task 2 step 2.1 |
| Delete `schemaToDomain` | Task 4 steps 4.4 + 4.6 |
| TS enum keys renamed | Task 2 steps 2.1 + 2.3 + 2.4 + Task 4 steps 4.1 + 4.2 |
| Bidirectional DB migration | Task 1 step 1.3 |
| Casing normalised to kebab-case | Encoded in OLD_TO_NEW (`sendMessage` → `send-message`, etc.) |
| Existing runtime/UI/DTO behaviour preserved | Tasks 2, 4 tests + Task 7 browser verify |
| Generated clients regenerated | Task 3 |
| Lookup table exhaustiveness | Task 5 |
| Docs updated | Task 6 |
| Browser screenshots posted to Linear | Task 7 |

## Out of scope (per spec)

- Payload `data` key renames
- New domains or new node types
- Catalog UI changes beyond mapper deletion
- Flow executor switch refactors
