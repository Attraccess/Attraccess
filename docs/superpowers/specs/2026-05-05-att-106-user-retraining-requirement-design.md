# ATT-106 — User Retraining Requirement

**Status:** Approved (design)
**Linear:** ATT-106
**GitHub:** Attraccess/Attraccess#181
**Branch:** `att-106-user-retraining-requirement`
**Author:** Jan Jaap (with Claude)
**Date:** 2026-05-05

## Problem

Users keep resource access (introductions) indefinitely once granted. Two real-world failure modes are not covered:

1. **Skill decay over calendar time.** Some machines (CNC, laser cutter, welder) require periodic retraining for safety regardless of usage.
2. **Skill decay over inactivity.** A user who hasn't touched a resource in many months may have forgotten safe operation, even if their introduction is "valid."

Operators cannot currently enforce either policy. Optional access blocking until retraining is required for high-risk resources.

## Goals

- Operators can configure retraining requirements per resource or resource group.
- Multiple stacked requirements per resource/group (e.g. yearly calendar AND 6-month inactivity).
- Three trigger types: time since introduction, inactivity within group, inactivity on specific resource.
- Per-schedule choice: warn-only or hard-block access until renewed.
- Email warning N days before due (configurable per schedule).
- Renewal flow that preserves the audit trail across cycles.

## Non-Goals

- Configuring retraining content (curriculum, materials).
- In-app retraining wizards or quizzes.
- Automatic recertification (a tutor still performs the renewal).
- Per-user overrides (e.g. "Bob is exempt from yearly retrain"). Out of scope; can be added later as a `ResourceIntroduction.expiryOverrideAt` column.

## Approach

Mirror the existing `ResourceMaintenanceSchedule` pattern. Same evaluator service shape, same trigger-config sub-entities, same cron + event-driven evaluation. Renewal piggybacks on the existing introduction history table — no new "current state" fields. Access enforcement extends `hasValidIntroduction` so the existing usage-start gate, AttracTap websocket gate, and frontend hook all gain expiration awareness automatically.

### Why this pattern

- Maintenance schedules already model "trigger types with config sub-entities and an evaluator." The data shapes, validators, controllers, and tests already exist as templates.
- Devs working on this won't need to learn new idioms.
- The `IntroductionHistoryAction` enum is the single source of truth for "what has happened to this introduction." Adding `RENEW`, `EXPIRE`, and `WARN_SENT` keeps audit reconstruction trivial: replay the history, current state derives.

## Data Model

### New entities

```ts
// libs/database-entities/src/lib/entities/resource-introduction-schedule.entity.ts
enum ResourceIntroductionScheduleTriggerType {
  TIME_SINCE_INTRODUCTION = 'TIME_SINCE_INTRODUCTION',
  INACTIVITY              = 'INACTIVITY',
}

enum ResourceIntroductionScheduleInactivityScope {
  GROUP    = 'GROUP',     // any usage of any resource in the same group resets baseline
  RESOURCE = 'RESOURCE',  // only usage of this exact resource resets baseline
}

enum RetrainingIntervalUnit {
  DAYS   = 'DAYS',
  WEEKS  = 'WEEKS',
  MONTHS = 'MONTHS',
  YEARS  = 'YEARS',
}
// New enum, not the existing UsageDurationUnit (which only goes MINUTES..DAYS
// and is used by maintenance triggers). Retraining intervals naturally span
// months/years, so a dedicated enum keeps both domains independent.

@Entity()
class ResourceIntroductionSchedule {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number | null;       // exactly one of resourceId / resourceGroupId
  resourceGroupId: number | null;
  name: string | null;
  enabled: boolean;                // default true
  triggerType: ResourceIntroductionScheduleTriggerType;
  blockAccess: boolean;            // default false; true = hard-gate usage
  warnDaysBefore: number;          // default 0 = no warning email
  timeSinceIntroductionConfig?: ResourceIntroductionScheduleTimeSinceIntroductionConfig;
  inactivityConfig?: ResourceIntroductionScheduleInactivityConfig;
}

@Entity()
class ResourceIntroductionScheduleTimeSinceIntroductionConfig {
  id: number;
  scheduleId: number;             // OneToOne back-ref
  duration: number;
  unit: RetrainingIntervalUnit;
}

@Entity()
class ResourceIntroductionScheduleInactivityConfig {
  id: number;
  scheduleId: number;
  duration: number;
  unit: UsageDurationUnit;
  scope: ResourceIntroductionScheduleInactivityScope;
}
```

### Extension to existing entity

```ts
// libs/database-entities/src/lib/entities/resourceIntroductionHistoryItem.entity.ts
enum IntroductionHistoryAction {
  REVOKE     = 'revoke',
  GRANT      = 'grant',
  RENEW      = 'renew',       // new — tutor refreshed introduction
  EXPIRE     = 'expire',      // new — system marker, schedule fired
  WARN_SENT  = 'warn_sent',   // new — system marker, warning email sent
}

@Entity()
class ResourceIntroductionHistoryItem {
  // ... existing fields ...
  performedByUserId: number | null;        // was non-null; nullable for system actions
  scheduleId: number | null;               // new — which schedule produced EXPIRE/WARN_SENT
}
```

`scheduleId` lets the evaluator de-duplicate per schedule (one EXPIRE per schedule per cycle, one WARN_SENT per schedule per cycle).

### Validators

Mirror `apps/api/src/resources/maintenances/validators/exactly-one-of.validator.ts`:

- DTO must include exactly one of `timeSinceIntroductionConfig` / `inactivityConfig`, matching `triggerType`.
- DTO must include exactly one of `resourceId` / `resourceGroupId` (enforced by route, not DTO).

### Migrations

One TypeORM migration that:

1. Creates three new tables.
2. Recreates `resource_introduction_history_item` (SQLite enum constraint requires table-rebuild) with extended `action` check, nullable `performedByUserId`, new `scheduleId` FK.
3. Backfill: existing rows keep `action ∈ {grant, revoke}` and non-null performer — no data change needed.

Test: migration up→down→up is idempotent and preserves all existing rows + values.

## Evaluator

```ts
// apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.ts

class IntroductionScheduleEvaluatorService {
  computeBaseline(introduction: ResourceIntroduction): Date
    // = max(introduction.completedAt, latest history.createdAt where action == RENEW)

  async computeDueAt(schedule, introduction): Promise<Date | null>
    // TIME_SINCE_INTRODUCTION: baseline + duration
    // INACTIVITY scope=RESOURCE: max(baseline, lastUsageOnResource(userId, resourceId)) + duration
    // INACTIVITY scope=GROUP:    max(baseline, lastUsageInGroup(userId, groupId))      + duration
    // null if INACTIVITY and no usage yet AND baseline alone wouldn't trigger

  async isDue(schedule, introduction, now = new Date()): Promise<boolean>

  async isWarning(schedule, introduction, now = new Date()): Promise<boolean>
    // schedule.warnDaysBefore > 0 && dueAt && now >= dueAt - warnDaysBefore && !isDue

  async isBlockedByExpiry(introduction): Promise<boolean>
    // any blockAccess=true schedule covering (introduction.resource ∪ its groups) where isDue

  async getSchedulesForIntroduction(introduction): Promise<ResourceIntroductionSchedule[]>
    // group-level + resource-level, only enabled

  async evaluateUserOnResource(userId, resourceId): Promise<{
    status: 'ACTIVE' | 'WARNING' | 'EXPIRED',
    expiresAt: Date | null,                  // earliest dueAt across schedules
    schedules: Array<{
      scheduleId, dueAt, isWarning, isDue, blockAccess,
    }>,
  }>

  @Cron('0 * * * *')                          // hourly
  async tick(): Promise<void>
    // for each enabled schedule:
    //   for each introduction it covers:
    //     if isDue && no EXPIRE history with this scheduleId after baseline:
    //       create EXPIRE history (performedByUserId=null, scheduleId)
    //       emit ResourceIntroductionChangedEvent
    //     if isWarning && no WARN_SENT history with this scheduleId after baseline:
    //       send introduction-expiry-warning email
    //       create WARN_SENT history
}
```

The cron tick is the only place that **writes** EXPIRE/WARN_SENT. Reads (`isBlockedByExpiry`, status DTO) compute on-the-fly so a schedule edit takes effect immediately without waiting for the next tick.

## Enforcement

```ts
// apps/api/src/resources/introductions/resouceIntroductions.service.ts (and groups equivalent)

async hasValidIntroduction(resourceId, userId, txMgr?): Promise<boolean> {
  const lastHistoryItem = await this.getLastNonSystemHistoryItemOfUser(resourceId, userId, txMgr);
  if (lastHistoryItem?.action !== IntroductionHistoryAction.GRANT
      && lastHistoryItem?.action !== IntroductionHistoryAction.RENEW) {
    return false;
  }
  const introduction = await this.getIntroductionOfUser(resourceId, userId, txMgr);
  return !await this.scheduleEvaluator.isBlockedByExpiry(introduction);
}
```

`getLastNonSystemHistoryItemOfUser` filters out EXPIRE/WARN_SENT (which are markers, not state changes). Concretely: the "active vs revoked" question is still answered by the last `GRANT|RENEW|REVOKE`. Expiry is layered on top.

This change is contained: every existing caller of `hasValidIntroduction` (usage-start, attractap websocket, status DTO, frontend hook) inherits the new behavior.

### Renewal

```
POST /resources/:resourceId/introductions/:userId/renew     body: { comment? }
POST /resource-groups/:groupId/introductions/:userId/renew  body: { comment? }
```

Authorization: same as grant (introducer for that resource/group).
Effect: append RENEW history item, emit `ResourceIntroductionChangedEvent`. Baseline recomputes to `now()`, all schedules reset.

## API

### Schedule CRUD (admin / `canManageResources` for now)

```
GET    /resources/:resourceId/introduction-schedules
POST   /resources/:resourceId/introduction-schedules
GET    /resources/:resourceId/introduction-schedules/:id
PATCH  /resources/:resourceId/introduction-schedules/:id
DELETE /resources/:resourceId/introduction-schedules/:id

GET    /resource-groups/:groupId/introduction-schedules
POST   /resource-groups/:groupId/introduction-schedules
GET    /resource-groups/:groupId/introduction-schedules/:id
PATCH  /resource-groups/:groupId/introduction-schedules/:id
DELETE /resource-groups/:groupId/introduction-schedules/:id
```

Body shape:
```json
{
  "name": "Yearly safety retrain",
  "triggerType": "TIME_SINCE_INTRODUCTION",
  "blockAccess": true,
  "warnDaysBefore": 30,
  "enabled": true,
  "timeSinceIntroductionConfig": { "duration": 1, "unit": "YEARS" }
}
```

### Renewal

```
POST /resources/:resourceId/introductions/:userId/renew
POST /resource-groups/:groupId/introductions/:userId/renew
```

### Status (extended)

```
GET /resources/:resourceId/introductions/:userId/status
->
{
  "hasValidIntroduction": true,
  "status": "WARNING",
  "expiresAt": "2026-06-04T00:00:00Z",
  "schedules": [
    { "scheduleId": 7, "dueAt": "2026-06-04T00:00:00Z", "isWarning": true, "isDue": false, "blockAccess": true }
  ]
}
```

### Self-service

```
GET /users/me/expiring-introductions
->
[
  { "kind": "resource",      "resourceId": 12, "name": "Lasercutter",   "status": "WARNING", "dueAt": "..." },
  { "kind": "resourceGroup", "resourceGroupId": 3, "name": "CNC pool",  "status": "EXPIRED", "dueAt": "..." }
]
```

## Frontend

### New routes/components

```
apps/frontend/src/app/resources/details/introduction-schedules/
  index.tsx                    list + add (mirrors maintenance-schedules/)
  upsert/index.tsx             trigger-type selector + dynamic config fields
  en.json, de.json
apps/frontend/src/app/resource-groups/IntroductionSchedules/
  same layout
```

### Extend existing

- `IntroductionStatusChip`: add WARNING (yellow) and EXPIRED (red) variants. Existing two states unchanged.
- `IntroductionRequiredDisplay`: copy variant for "expired — contact your tutor for retraining."
- `IntroductionsManagement` table: add Status column (chip), Expires column (relative time), and per-row Renew action when status ∈ {WARNING, EXPIRED}.
- `useHasValidIntroduction`: no signature change; behavior follows backend.
- New widget `MyExpiringIntroductions` on the home page (uses `/users/me/expiring-introductions`).

### Generated clients

After API merges, regenerate:
- `libs/api-client/src/generated/Api.ts`
- `libs/react-query-client/src/lib/requests/schemas.gen.ts`
- `libs/react-query-client/src/lib/requests/types.gen.ts`

## Notifications

Extend `EmailTemplateType`:
```
INTRODUCTION_EXPIRY_WARNING = 'introduction-expiry-warning'
INTRODUCTION_EXPIRED        = 'introduction-expired'
```

Default MJML templates seeded for en + de in the existing seeder (paths discovered during implementation). Variables: `{ userName, resourceName, dueAt, retrainingHint }`.

WARN_SENT history items prevent duplicate emails per cycle. EXPIRED email is sent once when EXPIRE is first written.

## Testing

Mirror `maintenance.service.spec.ts` and `maintenance.controller.spec.ts` style. All exhaustive.

### Backend unit (Jest + sqlite in-memory)

- `introduction-schedule.service.spec.ts` — CRUD, validation (exactly-one config), enable/disable, scoping (resource vs group).
- `introduction-schedule-evaluator.service.spec.ts`:
  - `computeBaseline`: no RENEW; one RENEW; multiple RENEWs (latest wins).
  - `computeDueAt`:
    - TIME_SINCE_INTRODUCTION: each unit (HOURS/DAYS/WEEKS/MONTHS/YEARS).
    - INACTIVITY scope=RESOURCE: usage on this resource resets, usage on sibling does not.
    - INACTIVITY scope=GROUP: usage on any group resource resets.
    - INACTIVITY no usage at all: dueAt computed from baseline.
  - `isDue` boundary: now=dueAt-1ms (false), now=dueAt (true), now=dueAt+1y (true).
  - `isWarning` boundary at warnDaysBefore edges.
  - `isBlockedByExpiry`: blockAccess=true blocks; blockAccess=false does not; group + resource schedules combined.
  - `tick`: emits EXPIRE once, idempotent on rerun, second cycle after RENEW emits new EXPIRE.
  - `tick`: sends WARN_SENT once per cycle, no double email.
- `resourceIntroductions.service.spec.ts` (extend existing):
  - `hasValidIntroduction` returns false when blocking schedule due.
  - `hasValidIntroduction` returns true when due but blockAccess=false.
  - RENEW flips access from EXPIRED to ACTIVE.
  - `getLastNonSystemHistoryItemOfUser` ignores EXPIRE/WARN_SENT.
- `resourceGroups.introductions.service.spec.ts` equivalents.
- `resourceUsage.service.spec.ts` (extend existing): startSession blocked by expired blocking schedule; allowed when warn-only.

### Backend integration / e2e (NestJS testing module)

- `introduction-schedule.controller.spec.ts` — POST/GET/PATCH/DELETE happy paths, auth failures, validation failures.
- `introduction-renewal.e2e-spec.ts` — full grant → wait → expire → renew → start usage flow.
- `introduction-inactivity-scope.e2e-spec.ts` — usage on different resource in group: scope=RESOURCE expires, scope=GROUP does not.
- Migration test: up → down → up preserves all rows.

### Frontend (Vitest)

- `IntroductionStatusChip.test.tsx` — renders correct color/label per status (ACTIVE, WARNING, EXPIRED).
- `introduction-schedules/upsert.test.tsx` — form validates trigger config: cannot submit time config when triggerType=INACTIVITY.
- `MyExpiringIntroductions.test.tsx` — empty state, populated state, status grouping.

### Acceptance criteria → test map

| Acceptance criterion | Test file(s) |
|---|---|
| Operator configures yearly retrain on a resource | `introduction-schedule.controller.spec.ts` |
| Operator configures 6-month inactivity rule on a group with scope=GROUP | `introduction-schedule.controller.spec.ts` + e2e |
| User access blocked when blocking schedule fires | `resourceUsage.service.spec.ts` + e2e |
| User access NOT blocked when warn-only schedule fires | `resourceUsage.service.spec.ts` |
| Tutor renews → access restored | `introduction-renewal.e2e-spec.ts` |
| Warning email sent once per cycle | `introduction-schedule-evaluator.service.spec.ts` |
| Multiple stacked schedules: any one fires → expired | `introduction-schedule-evaluator.service.spec.ts` |
| Audit trail intact across renew cycles | `resourceIntroductions.service.spec.ts` |

## Open Questions

None blocking. Possible follow-ups:

- Per-user expiry overrides (column on introduction).
- Push notification (in addition to email) — would slot into the existing notification fanout.
- Operator-facing "expired users" report per resource.

## Risks

- **Cron tick load.** Hourly scan over all schedules × covered introductions. Mitigation: schedules are typically <100 per system; introductions per schedule scale with users. Add an index on `(scheduleId)` in history items and consider chunked iteration if a system grows past ~10k introductions per schedule. Not a v1 concern.
- **Migration on existing DBs.** SQLite enum extension requires table rebuild. Tested up/down/up in CI.
- **Backwards compat for clients.** Status DTO grows new fields; clients ignore unknown fields. Frontend regenerated as part of this PR.
