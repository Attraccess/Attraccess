# Flow Variables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent, scoped (resource | global) variables to the resource-flow system, accessible from new SET/GET nodes, Handlebars templates, and a new INPUT_VARIABLE_CHANGED trigger node — implementing Linear ticket [ATT-278](https://linear.app/attraccess/issue/ATT-278/variables-in-flows).

**Architecture:** New TypeORM entity `ResourceFlowVariable` with unique `(scope, resourceId, key)`. Backend service mediates all reads/writes and emits a NestJS event on real (deep-equal) value changes. Executor injects current variable values into the Handlebars template context, and adds three new node handlers (SET, GET, INPUT_VARIABLE_CHANGED). Admin UI is a modal opened from the flow editor toolbar.

**Tech Stack:** NestJS 11, TypeORM 0.3.28 (SQLite dev), Handlebars 4, NestJS EventEmitter2 v3, Zod (with `z.toJSONSchema`), Jest 30, React + HeroUI, Vitest 4, openapi-rq for client codegen.

**Authoritative spec:** [`docs/superpowers/specs/2026-05-06-flow-variables-design.md`](../specs/2026-05-06-flow-variables-design.md)

---

## File Structure

### Created files

- `libs/database-entities/src/lib/entities/resourceFlowVariable.ts` — entity definition.
- `apps/api/src/database/migrations/1778000000000-flow-variables.ts` — table + index + cascade FK migration.
- `apps/api/src/resources/flows/resource-flow-variables.service.ts` — read/write API + change-event emission.
- `apps/api/src/resources/flows/resource-flow-variables.service.spec.ts` — service unit tests.
- `apps/api/src/resources/flows/resource-flow-variables.controller.ts` — REST endpoints.
- `apps/api/src/resources/flows/resource-flow-variables.controller.spec.ts` — controller unit tests.
- `apps/api/src/resources/flows/dto/flow-variable.dto.ts` — request/response DTOs.
- `apps/api/src/resources/flows/events/flow-variable-changed.event.ts` — event class.
- `apps/api/src/resources/flows/resource-flow-variable-trigger.service.ts` — `@OnEvent` subscriber that fires `INPUT_VARIABLE_CHANGED` flows.
- `apps/api/src/resources/flows/resource-flow-variable-trigger.service.spec.ts` — subscriber tests.
- `apps/frontend/src/app/resources/details/flows/flowVariablesModal/index.tsx` — admin modal.
- `apps/frontend/src/app/resources/details/flows/flowVariablesModal/index.spec.tsx` — modal tests.

### Modified files

- `libs/database-entities/src/lib/entities-index.ts` — export new entity + node-type constants used by frontend.
- `libs/database-entities/src/lib/entities/resourceFlowNode.ts` — extend `ResourceFlowNodeType` enum, add three Zod schemas, extend `getNodeDataSchema`.
- `libs/database-entities/src/lib/entities/resource.entity.ts` — `OneToMany` relation to `ResourceFlowVariable`.
- `apps/api/src/database/migrations/index.ts` — export new migration.
- `apps/api/src/resources/flows/resource-flows.module.ts` — register new entity, service, controller, and trigger subscriber.
- `apps/api/src/resources/flows/resource-flows-executor.service.ts` — inject service, extend template context, add three node handlers, extend `processNode` switch.
- `apps/api/src/resources/flows/resource-flows.service.ts` — list new node types in `getNodeSchemas` enumeration (auto via enum iteration if it already does).
- `apps/api/src/resources/flows/resource-flows-executor.service.spec.ts` — handler tests.
- `apps/frontend/src/app/resources/details/flows/index.tsx` — add toolbar button that opens the modal.

---

## Task 1: Add `ResourceFlowVariable` entity and migration

**Files:**
- Create: `libs/database-entities/src/lib/entities/resourceFlowVariable.ts`
- Create: `apps/api/src/database/migrations/1778000000000-flow-variables.ts`
- Modify: `libs/database-entities/src/lib/entities-index.ts`
- Modify: `libs/database-entities/src/lib/entities/resource.entity.ts`
- Modify: `apps/api/src/database/migrations/index.ts`

- [ ] **Step 1: Define enum + entity**

Create `libs/database-entities/src/lib/entities/resourceFlowVariable.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';

export enum ResourceFlowVariableScope {
  RESOURCE = 'resource',
  GLOBAL = 'global',
}

export type ResourceFlowVariableValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

@Entity()
@Unique('UQ_resource_flow_variable_scope_resource_key', ['scope', 'resourceId', 'key'])
@Index('IDX_resource_flow_variable_resource', ['resourceId'])
export class ResourceFlowVariable {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Internal id', example: 1 })
  id!: number;

  @Column({ type: 'varchar' })
  @ApiProperty({ enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  scope!: ResourceFlowVariableScope;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Owning resource id, null when scope=global', nullable: true })
  resourceId!: number | null;

  @Column({ type: 'varchar' })
  @ApiProperty({ description: 'Variable key' })
  key!: string;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'JSON-stringified value' })
  value!: string;

  @Column({ type: 'varchar' })
  @ApiProperty({ description: 'Value JSON type tag' })
  valueType!: ResourceFlowVariableValueType;

  @CreateDateColumn()
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ManyToOne(() => Resource, (resource) => resource.flowVariables, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource | null;
}
```

- [ ] **Step 2: Add reverse relation on `Resource`**

In `libs/database-entities/src/lib/entities/resource.entity.ts`, add (next to the existing `flowNodes` relation; mirror its style and import):

```ts
import { ResourceFlowVariable } from './resourceFlowVariable';

// inside class Resource, alongside flowNodes:
@OneToMany(() => ResourceFlowVariable, (variable) => variable.resource)
flowVariables!: ResourceFlowVariable[];
```

- [ ] **Step 3: Export from entities-index**

In `libs/database-entities/src/lib/entities-index.ts`, add:

```ts
import {
  ResourceFlowVariable,
  ResourceFlowVariableScope,
} from './entities/resourceFlowVariable';
export type { ResourceFlowVariableValueType } from './entities/resourceFlowVariable';
// add to the central re-export object/list, mirroring the existing ResourceFlowNode export
export { ResourceFlowVariable, ResourceFlowVariableScope };
```

(Place the entity in the same array where `ResourceFlowNode`, `ResourceFlowEdge`, `ResourceFlowLog` are aggregated.)

- [ ] **Step 4: Write migration**

Create `apps/api/src/database/migrations/1778000000000-flow-variables.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FlowVariables1778000000000 implements MigrationInterface {
  name = 'FlowVariables1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_flow_variable" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
        `"scope" varchar NOT NULL, "resourceId" integer, "key" varchar NOT NULL, ` +
        `"value" text NOT NULL, "valueType" varchar NOT NULL, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `CONSTRAINT "UQ_resource_flow_variable_scope_resource_key" UNIQUE ("scope", "resourceId", "key"), ` +
        `CONSTRAINT "FK_resource_flow_variable_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_flow_variable_resource" ON "resource_flow_variable" ("resourceId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_flow_variable_resource"`);
    await queryRunner.query(`DROP TABLE "resource_flow_variable"`);
  }
}
```

- [ ] **Step 5: Register migration**

Append to `apps/api/src/database/migrations/index.ts`:

```ts
export * from './1778000000000-flow-variables';
```

- [ ] **Step 6: Build entities lib + run migration sanity check**

Run: `pnpm nx build database-entities`
Expected: no TypeScript errors.

Run: `pnpm nx run api:typeorm -- migration:run` (or whatever the existing project-defined migration script is — check `apps/api/project.json` if unsure)
Expected: migration applies, no errors. If running locally clobbers state, skip and rely on automated test DB sync.

- [ ] **Step 7: Commit**

```bash
git add libs/database-entities/src/lib/entities/resourceFlowVariable.ts \
        libs/database-entities/src/lib/entities/resource.entity.ts \
        libs/database-entities/src/lib/entities-index.ts \
        apps/api/src/database/migrations/1778000000000-flow-variables.ts \
        apps/api/src/database/migrations/index.ts
git commit -m "feat(flows): add ResourceFlowVariable entity and migration (ATT-278)"
```

---

## Task 2: Add new `ResourceFlowNodeType` values and Zod schemas

**Files:**
- Modify: `libs/database-entities/src/lib/entities/resourceFlowNode.ts`

- [ ] **Step 1: Extend the enum**

Add to `ResourceFlowNodeType`:

```ts
INPUT_VARIABLE_CHANGED = 'input.variable.changed',
PROCESSING_SET_VARIABLES = 'processing.variables.set',
PROCESSING_GET_VARIABLES = 'processing.variables.get',
```

- [ ] **Step 2: Add scope constant + shared sub-schemas**

Above the existing schemas in the same file:

```ts
export const VariableScopeSchema = z.enum(['resource', 'global']);

const VariableKeySchema = z.string().min(1, 'Key is required');
```

- [ ] **Step 3: Add SET/GET/CHANGED schemas**

```ts
export const SetVariablesNodeDataSchema = z.object({
  variables: z
    .array(
      z.object({
        key: VariableKeySchema,
        value: z.string().optional().default('').meta({ stringVariant: 'multiline' }),
        scope: VariableScopeSchema,
      }),
    )
    .min(1, 'At least one variable is required'),
});

export const GetVariablesNodeDataSchema = z.object({
  variables: z
    .array(
      z.object({
        key: VariableKeySchema,
        scope: VariableScopeSchema,
        payloadPath: z.string().min(1, 'Payload path is required'),
      }),
    )
    .min(1, 'At least one variable is required'),
});

export const VariableChangedNodeDataSchema = z.object({
  watches: z
    .array(z.object({ key: VariableKeySchema, scope: VariableScopeSchema }))
    .min(1, 'At least one watch is required'),
  source: z.enum(['any', 'exclude-self']).default('any'),
});
```

- [ ] **Step 4: Wire into `getNodeDataSchema`**

Add three cases inside `getNodeDataSchema`:

```ts
case ResourceFlowNodeType.PROCESSING_SET_VARIABLES:
  return SetVariablesNodeDataSchema;

case ResourceFlowNodeType.PROCESSING_GET_VARIABLES:
  return GetVariablesNodeDataSchema;

case ResourceFlowNodeType.INPUT_VARIABLE_CHANGED:
  return VariableChangedNodeDataSchema;
```

- [ ] **Step 5: Build entities lib**

Run: `pnpm nx build database-entities`
Expected: no errors. The `exhaustiveCheck: never` line in `getNodeDataSchema` proves all enum members are handled.

- [ ] **Step 6: Commit**

```bash
git add libs/database-entities/src/lib/entities/resourceFlowNode.ts
git commit -m "feat(flows): add SET/GET/CHANGED variable node schemas (ATT-278)"
```

---

## Task 3: Implement `ResourceFlowVariablesService`

**Files:**
- Create: `apps/api/src/resources/flows/events/flow-variable-changed.event.ts`
- Create: `apps/api/src/resources/flows/resource-flow-variables.service.ts`
- Test: `apps/api/src/resources/flows/resource-flow-variables.service.spec.ts`

- [ ] **Step 1: Write failing service test**

Create `apps/api/src/resources/flows/resource-flow-variables.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceFlowVariable, ResourceFlowVariableScope } from '@attraccess/database-entities';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { FlowVariableChangedEvent } from './events/flow-variable-changed.event';

describe('ResourceFlowVariablesService', () => {
  let service: ResourceFlowVariablesService;
  let repo: jest.Mocked<Repository<ResourceFlowVariable>>;
  let emitter: { emit: jest.Mock };
  let store: ResourceFlowVariable[];

  beforeEach(async () => {
    store = [];
    repo = {
      findOne: jest.fn(({ where }) =>
        store.find(
          (r) =>
            r.scope === where.scope &&
            r.key === where.key &&
            (where.resourceId ?? null) === r.resourceId,
        ) ?? null,
      ),
      find: jest.fn(({ where }) =>
        store.filter((r) =>
          (Array.isArray(where) ? where : [where]).some(
            (w) =>
              r.scope === w.scope &&
              (w.resourceId ?? null) === r.resourceId,
          ),
        ),
      ),
      save: jest.fn(async (row) => {
        const idx = store.findIndex(
          (r) => r.scope === row.scope && r.key === row.key && (row.resourceId ?? null) === r.resourceId,
        );
        const persisted = { ...row, id: row.id ?? store.length + 1, updatedAt: new Date() } as ResourceFlowVariable;
        if (idx >= 0) store[idx] = persisted;
        else store.push(persisted);
        return persisted;
      }),
      delete: jest.fn(async (criteria) => {
        const before = store.length;
        store = store.filter(
          (r) => !(r.scope === criteria.scope && r.key === criteria.key && (criteria.resourceId ?? null) === r.resourceId),
        );
        return { affected: before - store.length, raw: [] };
      }),
    } as unknown as jest.Mocked<Repository<ResourceFlowVariable>>;

    emitter = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFlowVariablesService,
        { provide: getRepositoryToken(ResourceFlowVariable), useValue: repo },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = moduleRef.get(ResourceFlowVariablesService);
  });

  it('returns undefined for missing var', async () => {
    expect(await service.get(ResourceFlowVariableScope.GLOBAL, null, 'missing')).toBeUndefined();
  });

  it('upserts and returns parsed value', async () => {
    await service.set(ResourceFlowVariableScope.GLOBAL, null, 'count', 42, null);
    expect(await service.get(ResourceFlowVariableScope.GLOBAL, null, 'count')).toBe(42);
  });

  it('emits event only when value actually changes', async () => {
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'k', { a: 1 }, 7);
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'k', { a: 1 }, 7);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    const [name, evt] = emitter.emit.mock.calls[0];
    expect(name).toBe('flow-variable.changed');
    expect(evt).toBeInstanceOf(FlowVariableChangedEvent);
    expect(evt.previousValue).toBeUndefined();
    expect(evt.newValue).toEqual({ a: 1 });
  });

  it('emits with previousValue on update', async () => {
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'k', 'a', 7);
    emitter.emit.mockClear();
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'k', 'b', 7);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    const [, evt] = emitter.emit.mock.calls[0];
    expect(evt.previousValue).toBe('a');
    expect(evt.newValue).toBe('b');
  });

  it('getAll returns split-by-scope object', async () => {
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'foo', 1, 7);
    await service.set(ResourceFlowVariableScope.GLOBAL, null, 'bar', 'baz', 7);
    expect(await service.getAll(7)).toEqual({
      resource: { foo: 1 },
      global: { bar: 'baz' },
    });
  });

  it('delete removes the row', async () => {
    await service.set(ResourceFlowVariableScope.GLOBAL, null, 'k', 'v', null);
    await service.delete(ResourceFlowVariableScope.GLOBAL, null, 'k');
    expect(await service.get(ResourceFlowVariableScope.GLOBAL, null, 'k')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm nx test api -- --testPathPattern=resource-flow-variables.service`
Expected: FAIL — service module not found.

- [ ] **Step 3: Implement event class**

Create `apps/api/src/resources/flows/events/flow-variable-changed.event.ts`:

```ts
import { ResourceFlowVariableScope } from '@attraccess/database-entities';

export class FlowVariableChangedEvent {
  static readonly EVENT_NAME = 'flow-variable.changed';

  constructor(
    public readonly scope: ResourceFlowVariableScope,
    public readonly resourceId: number | null,
    public readonly key: string,
    public readonly previousValue: unknown,
    public readonly newValue: unknown,
    public readonly changedAt: Date,
    public readonly sourceResourceId: number | null,
  ) {}
}
```

- [ ] **Step 4: Implement service**

Create `apps/api/src/resources/flows/resource-flow-variables.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { In, IsNull, Repository } from 'typeorm';
import {
  ResourceFlowVariable,
  ResourceFlowVariableScope,
  ResourceFlowVariableValueType,
} from '@attraccess/database-entities';
import { FlowVariableChangedEvent } from './events/flow-variable-changed.event';

type ScopedKey = { scope: ResourceFlowVariableScope; key: string };

function classifyValueType(value: unknown): ResourceFlowVariableValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') return t;
  return 'string';
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

@Injectable()
export class ResourceFlowVariablesService {
  private readonly logger = new Logger(ResourceFlowVariablesService.name);

  constructor(
    @InjectRepository(ResourceFlowVariable)
    private readonly repository: Repository<ResourceFlowVariable>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private resolveResourceId(scope: ResourceFlowVariableScope, resourceId: number | null): number | null {
    return scope === ResourceFlowVariableScope.GLOBAL ? null : resourceId;
  }

  async get(scope: ResourceFlowVariableScope, resourceId: number | null, key: string): Promise<unknown> {
    const row = await this.repository.findOne({
      where: { scope, resourceId: this.resolveResourceId(scope, resourceId) ?? IsNull(), key },
    });
    return row ? this.deserialize(row) : undefined;
  }

  async getMany(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    keys: string[],
  ): Promise<Record<string, unknown>> {
    if (keys.length === 0) return {};
    const rows = await this.repository.find({
      where: { scope, resourceId: this.resolveResourceId(scope, resourceId) ?? IsNull(), key: In(keys) },
    });
    return Object.fromEntries(rows.map((r) => [r.key, this.deserialize(r)]));
  }

  async getAll(resourceId: number | null): Promise<{ resource: Record<string, unknown>; global: Record<string, unknown> }> {
    const rows = await this.repository.find({
      where: [
        { scope: ResourceFlowVariableScope.GLOBAL, resourceId: IsNull() },
        ...(resourceId == null ? [] : [{ scope: ResourceFlowVariableScope.RESOURCE, resourceId }]),
      ],
    });
    const out = { resource: {} as Record<string, unknown>, global: {} as Record<string, unknown> };
    for (const r of rows) {
      const target = r.scope === ResourceFlowVariableScope.GLOBAL ? out.global : out.resource;
      target[r.key] = this.deserialize(r);
    }
    return out;
  }

  async set(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    key: string,
    value: unknown,
    sourceResourceId: number | null,
  ): Promise<void> {
    const ownerId = this.resolveResourceId(scope, resourceId);
    const existing = await this.repository.findOne({
      where: { scope, resourceId: ownerId ?? IsNull(), key },
    });
    const previousValue = existing ? this.deserialize(existing) : undefined;

    if (existing && deepEqual(previousValue, value)) {
      return;
    }

    const serialized = JSON.stringify(value);
    const row = await this.repository.save({
      ...(existing ?? {}),
      scope,
      resourceId: ownerId,
      key,
      value: serialized,
      valueType: classifyValueType(value),
    });

    this.eventEmitter.emit(
      FlowVariableChangedEvent.EVENT_NAME,
      new FlowVariableChangedEvent(scope, ownerId, key, previousValue, value, row.updatedAt ?? new Date(), sourceResourceId),
    );
  }

  async delete(scope: ResourceFlowVariableScope, resourceId: number | null, key: string): Promise<void> {
    await this.repository.delete({
      scope,
      resourceId: this.resolveResourceId(scope, resourceId),
      key,
    });
  }

  async listForResource(resourceId: number): Promise<ResourceFlowVariable[]> {
    return this.repository.find({
      where: [
        { scope: ResourceFlowVariableScope.GLOBAL, resourceId: IsNull() },
        { scope: ResourceFlowVariableScope.RESOURCE, resourceId },
      ],
      order: { scope: 'ASC', key: 'ASC' },
    });
  }

  private deserialize(row: ResourceFlowVariable): unknown {
    try {
      return JSON.parse(row.value);
    } catch (err) {
      this.logger.warn(`Variable ${row.scope}:${row.resourceId}:${row.key} stored as raw string`);
      return row.value;
    }
  }
}
```

- [ ] **Step 5: Run tests until green**

Run: `pnpm nx test api -- --testPathPattern=resource-flow-variables.service`
Expected: PASS for all six cases.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/resources/flows/events/flow-variable-changed.event.ts \
        apps/api/src/resources/flows/resource-flow-variables.service.ts \
        apps/api/src/resources/flows/resource-flow-variables.service.spec.ts
git commit -m "feat(flows): add ResourceFlowVariablesService with deep-equal change events (ATT-278)"
```

---

## Task 4: REST controller for variable admin

**Files:**
- Create: `apps/api/src/resources/flows/dto/flow-variable.dto.ts`
- Create: `apps/api/src/resources/flows/resource-flow-variables.controller.ts`
- Test: `apps/api/src/resources/flows/resource-flow-variables.controller.spec.ts`

- [ ] **Step 1: Write failing controller test**

Create `apps/api/src/resources/flows/resource-flow-variables.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ResourceFlowVariableScope } from '@attraccess/database-entities';
import { ResourceFlowVariablesController } from './resource-flow-variables.controller';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';

describe('ResourceFlowVariablesController', () => {
  let controller: ResourceFlowVariablesController;
  let service: jest.Mocked<ResourceFlowVariablesService>;

  beforeEach(async () => {
    service = {
      listForResource: jest.fn(async () => [
        { id: 1, scope: ResourceFlowVariableScope.RESOURCE, resourceId: 5, key: 'a', value: '"x"', valueType: 'string', createdAt: new Date(), updatedAt: new Date() } as never,
      ]),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ResourceFlowVariablesService>;

    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceFlowVariablesController],
      providers: [{ provide: ResourceFlowVariablesService, useValue: service }],
    }).compile();

    controller = moduleRef.get(ResourceFlowVariablesController);
  });

  it('lists variables for resource', async () => {
    const result = await controller.list(5);
    expect(service.listForResource).toHaveBeenCalledWith(5);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ scope: ResourceFlowVariableScope.RESOURCE, key: 'a', value: 'x' });
  });

  it('upserts via PUT', async () => {
    await controller.upsert(5, ResourceFlowVariableScope.GLOBAL, 'k', { value: { foo: 1 } });
    expect(service.set).toHaveBeenCalledWith(ResourceFlowVariableScope.GLOBAL, 5, 'k', { foo: 1 }, 5);
  });

  it('upsert resolves resource scope to its resource id', async () => {
    await controller.upsert(7, ResourceFlowVariableScope.RESOURCE, 'k', { value: 'v' });
    expect(service.set).toHaveBeenCalledWith(ResourceFlowVariableScope.RESOURCE, 7, 'k', 'v', 7);
  });

  it('deletes via DELETE', async () => {
    await controller.remove(5, ResourceFlowVariableScope.GLOBAL, 'k');
    expect(service.delete).toHaveBeenCalledWith(ResourceFlowVariableScope.GLOBAL, 5, 'k');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `pnpm nx test api -- --testPathPattern=resource-flow-variables.controller`
Expected: FAIL — controller missing.

- [ ] **Step 3: Implement DTOs**

Create `apps/api/src/resources/flows/dto/flow-variable.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ResourceFlowVariableScope, ResourceFlowVariableValueType } from '@attraccess/database-entities';

export class FlowVariableDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  scope!: ResourceFlowVariableScope;
  @ApiProperty({ nullable: true, type: Number }) resourceId!: number | null;
  @ApiProperty() key!: string;
  @ApiProperty({ description: 'Parsed JSON value', type: Object })
  value!: unknown;
  @ApiProperty() valueType!: ResourceFlowVariableValueType;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class FlowVariableUpsertDto {
  @ApiProperty({ description: 'Any JSON value', type: Object })
  value!: unknown;
}
```

- [ ] **Step 4: Implement controller**

Create `apps/api/src/resources/flows/resource-flow-variables.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, ResourceFlowVariableScope } from '@attraccess/plugins-backend-sdk';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { FlowVariableDto, FlowVariableUpsertDto } from './dto/flow-variable.dto';

@ApiTags('Flow Variables')
@Controller('resources/:resourceId/flow-variables')
@Auth('canManageResources')
export class ResourceFlowVariablesController {
  constructor(private readonly service: ResourceFlowVariablesService) {}

  @Get()
  @ApiOperation({ summary: 'List flow variables for a resource', operationId: 'listFlowVariables' })
  @ApiResponse({ status: 200, type: FlowVariableDto, isArray: true })
  async list(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<FlowVariableDto[]> {
    const rows = await this.service.listForResource(resourceId);
    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      resourceId: row.resourceId,
      key: row.key,
      value: this.safeParse(row.value),
      valueType: row.valueType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  @Put(':scope/:key')
  @ApiOperation({ summary: 'Upsert a flow variable', operationId: 'upsertFlowVariable' })
  @ApiParam({ name: 'scope', enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 204 })
  async upsert(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scope') scope: ResourceFlowVariableScope,
    @Param('key') key: string,
    @Body() body: FlowVariableUpsertDto,
  ): Promise<void> {
    await this.service.set(scope, resourceId, key, body.value, resourceId);
  }

  @Delete(':scope/:key')
  @ApiOperation({ summary: 'Delete a flow variable', operationId: 'deleteFlowVariable' })
  @ApiParam({ name: 'scope', enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 204 })
  async remove(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scope') scope: ResourceFlowVariableScope,
    @Param('key') key: string,
  ): Promise<void> {
    await this.service.delete(scope, resourceId, key);
  }

  private safeParse(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
```

If `ResourceFlowVariableScope` is not yet re-exported from `@attraccess/plugins-backend-sdk`, import it directly from `@attraccess/database-entities` instead. Verify the SDK barrel; mirror however `ResourceFlowNodeType` is re-exported.

- [ ] **Step 5: Run tests**

Run: `pnpm nx test api -- --testPathPattern=resource-flow-variables.controller`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/resources/flows/dto/flow-variable.dto.ts \
        apps/api/src/resources/flows/resource-flow-variables.controller.ts \
        apps/api/src/resources/flows/resource-flow-variables.controller.spec.ts
git commit -m "feat(flows): add REST endpoints for flow variable admin (ATT-278)"
```

---

## Task 5: Wire executor — template context + SET/GET node handlers

**Files:**
- Modify: `apps/api/src/resources/flows/resource-flows-executor.service.ts`
- Modify: `apps/api/src/resources/flows/resource-flows-executor.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Append the following describe block to `resource-flows-executor.service.spec.ts` (mirror the existing module-setup pattern in that file — provide a mock for `ResourceFlowVariablesService`):

```ts
describe('variable nodes', () => {
  it('PROCESSING_SET_VARIABLES renders templates and stores JSON-parsed values', async () => {
    // Arrange a node of type PROCESSING_SET_VARIABLES with two variables:
    // - { key: 'count', value: '{{payload.n}}', scope: 'global' }
    // - { key: 'note',  value: 'hello {{payload.who}}', scope: 'resource' }
    // Run executor.processNode with input { n: 5, who: 'world' }
    // Expect variablesService.set called with parsed number 5 (global) and string 'hello world' (resource).
    // Use existing executor test harness; spy on variablesService.set.
  });

  it('PROCESSING_GET_VARIABLES writes lodash-set into payload', async () => {
    // variablesService.getMany returns { sessionId: 99 }
    // node config: variables: [{ key: 'sessionId', scope: 'resource', payloadPath: 'session.id' }]
    // input: {}
    // Expect output payload to deep-equal { session: { id: 99 } }
  });

  it('flow execution context exposes variables.resource.* and variables.global.*', async () => {
    // variablesService.getAll returns { resource: { foo: 1 }, global: { bar: 'x' } }
    // template '{{variables.resource.foo}}-{{variables.global.bar}}' should compile to '1-x'
    // Verify by running an HTTP node (existing test pattern) with templated body.
  });
});
```

Replace the comments with concrete arrange/act/assert mirroring the existing tests in the same file. Use the established `Test.createTestingModule({...})` setup; supply a `ResourceFlowVariablesService` mock with `set`, `getMany`, `getAll` methods.

- [ ] **Step 2: Run failing tests**

Run: `pnpm nx test api -- --testPathPattern=resource-flows-executor.service`
Expected: FAIL — handlers missing / unknown node type.

- [ ] **Step 3: Inject service**

In `resource-flows-executor.service.ts`, import:

```ts
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { ResourceFlowVariableScope } from '@attraccess/database-entities';
import * as lodashSet from 'lodash.set';
```

Add `ResourceFlowVariablesService` to the constructor. (If `lodash` is already a dep, use `import { set as lodashSet } from 'lodash';` — check `package.json`.)

- [ ] **Step 4: Inject variables into template context**

In `withResourceContext` (around line 272), after building the `context` object, add:

```ts
const variables = await this.variablesService.getAll(resourceId);
return {
  ...payloadRecord,
  resource: { ...(this.isPlainObject(payloadRecord.resource) ? payloadRecord.resource : {}), ...context },
  variables,
};
```

(Adjust to merge correctly with the existing branch that handles a pre-existing `resource` key. Preserve existing behavior, only add `variables`.)

- [ ] **Step 5: Add SET node handler**

Add private method:

```ts
private async processSetVariablesNode(
  node: ResourceFlowNode,
  input: object,
): Promise<NodeProcessingResult> {
  const data = SetVariablesNodeDataSchema.parse(node.data);
  for (const item of data.variables) {
    const renderedKey = this.compileTemplate(item.key, input);
    const renderedValue = this.compileTemplate(item.value, input);
    let parsed: unknown = renderedValue;
    try {
      parsed = JSON.parse(renderedValue);
    } catch {
      // leave as string
    }
    const ownerId = item.scope === 'resource' ? node.resourceId : null;
    await this.variablesService.set(
      item.scope as ResourceFlowVariableScope,
      ownerId,
      renderedKey,
      parsed,
      node.resourceId,
    );
  }
  return { payload: input };
}
```

- [ ] **Step 6: Add GET node handler**

```ts
private async processGetVariablesNode(
  node: ResourceFlowNode,
  input: object,
): Promise<NodeProcessingResult> {
  const data = GetVariablesNodeDataSchema.parse(node.data);
  const payload = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  for (const item of data.variables) {
    const renderedKey = this.compileTemplate(item.key, input);
    const ownerId = item.scope === 'resource' ? node.resourceId : null;
    const value = await this.variablesService.get(
      item.scope as ResourceFlowVariableScope,
      ownerId,
      renderedKey,
    );
    if (value === undefined) {
      this.logger.warn(`GET variable miss: ${item.scope}:${renderedKey}`);
    }
    lodashSet(payload, item.payloadPath, value);
  }
  return { payload };
}
```

- [ ] **Step 7: Add INPUT_VARIABLE_CHANGED pass-through case**

Inside `processNode` switch, in the existing `INPUT_*` group:

```ts
case ResourceFlowNodeType.INPUT_VARIABLE_CHANGED:
  responseOfNode = { payload: input };
  break;
```

And add cases for SET / GET:

```ts
case ResourceFlowNodeType.PROCESSING_SET_VARIABLES:
  responseOfNode = await this.processSetVariablesNode(node, input);
  break;

case ResourceFlowNodeType.PROCESSING_GET_VARIABLES:
  responseOfNode = await this.processGetVariablesNode(node, input);
  break;
```

(Also add `INPUT_VARIABLE_CHANGED` to the import list of `ResourceFlowNodeType` if not already covered.)

Imports also need `SetVariablesNodeDataSchema`, `GetVariablesNodeDataSchema`.

- [ ] **Step 8: Run executor tests**

Run: `pnpm nx test api -- --testPathPattern=resource-flows-executor.service`
Expected: PASS for the new "variable nodes" describe and all existing tests.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/resources/flows/resource-flows-executor.service.ts \
        apps/api/src/resources/flows/resource-flows-executor.service.spec.ts
git commit -m "feat(flows): SET/GET variable node handlers + template context (ATT-278)"
```

---

## Task 6: Variable-changed trigger subscriber

**Files:**
- Create: `apps/api/src/resources/flows/resource-flow-variable-trigger.service.ts`
- Test: `apps/api/src/resources/flows/resource-flow-variable-trigger.service.spec.ts`

- [ ] **Step 1: Write failing test**

Create `resource-flow-variable-trigger.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariableScope,
} from '@attraccess/database-entities';
import { FlowVariableChangedEvent } from './events/flow-variable-changed.event';
import { ResourceFlowVariableTriggerService } from './resource-flow-variable-trigger.service';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';

const node = (id: string, resourceId: number, watches: Array<{ scope: string; key: string }>, source: 'any' | 'exclude-self' = 'any') =>
  ({
    id,
    type: ResourceFlowNodeType.INPUT_VARIABLE_CHANGED,
    resourceId,
    data: { watches, source },
  } as ResourceFlowNode);

describe('ResourceFlowVariableTriggerService', () => {
  let triggerService: ResourceFlowVariableTriggerService;
  let nodeRepo: jest.Mocked<Repository<ResourceFlowNode>>;
  let executor: jest.Mocked<ResourceFlowsExecutorService>;
  let variables: jest.Mocked<ResourceFlowVariablesService>;

  beforeEach(async () => {
    nodeRepo = { find: jest.fn() } as never;
    executor = { startFlow: jest.fn() } as never;
    variables = {
      getMany: jest.fn(async () => ({ a: 1 })),
    } as never;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFlowVariableTriggerService,
        { provide: getRepositoryToken(ResourceFlowNode), useValue: nodeRepo },
        { provide: ResourceFlowsExecutorService, useValue: executor },
        { provide: ResourceFlowVariablesService, useValue: variables },
      ],
    }).compile();

    triggerService = moduleRef.get(ResourceFlowVariableTriggerService);
  });

  it('starts flow for each matching node', async () => {
    nodeRepo.find.mockResolvedValueOnce([
      node('n1', 7, [{ scope: 'resource', key: 'a' }]),
      node('n2', 8, [{ scope: 'resource', key: 'a' }]),
    ]);

    await triggerService.handle(
      new FlowVariableChangedEvent(
        ResourceFlowVariableScope.RESOURCE,
        7,
        'a',
        0,
        1,
        new Date(),
        7,
      ),
    );

    expect(executor.startFlow).toHaveBeenCalledTimes(1);
    expect(executor.startFlow.mock.calls[0][0].id).toBe('n1');
  });

  it('drops same-source events when source=exclude-self', async () => {
    nodeRepo.find.mockResolvedValueOnce([
      node('self', 7, [{ scope: 'global', key: 'k' }], 'exclude-self'),
    ]);

    await triggerService.handle(
      new FlowVariableChangedEvent(ResourceFlowVariableScope.GLOBAL, null, 'k', 0, 1, new Date(), 7),
    );

    expect(executor.startFlow).not.toHaveBeenCalled();
  });

  it('payload exposes change meta and current watched values', async () => {
    nodeRepo.find.mockResolvedValueOnce([node('n', 7, [{ scope: 'global', key: 'k' }])]);
    const changedAt = new Date();

    await triggerService.handle(
      new FlowVariableChangedEvent(ResourceFlowVariableScope.GLOBAL, null, 'k', 0, 9, changedAt, 8),
    );

    const [, input] = executor.startFlow.mock.calls[0];
    expect(input.payload.change).toEqual({
      scope: 'global',
      key: 'k',
      previousValue: 0,
      newValue: 9,
      changedAt: changedAt.toISOString(),
      sourceResourceId: 8,
    });
    expect(input.payload.variables.global).toBeDefined();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm nx test api -- --testPathPattern=resource-flow-variable-trigger.service`
Expected: FAIL — service missing.

- [ ] **Step 3: Implement subscriber**

Create `apps/api/src/resources/flows/resource-flow-variable-trigger.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariableScope,
  VariableChangedNodeDataSchema,
} from '@attraccess/database-entities';
import { FlowVariableChangedEvent } from './events/flow-variable-changed.event';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';

@Injectable()
export class ResourceFlowVariableTriggerService {
  private readonly logger = new Logger(ResourceFlowVariableTriggerService.name);

  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly nodeRepository: Repository<ResourceFlowNode>,
    private readonly executor: ResourceFlowsExecutorService,
    private readonly variables: ResourceFlowVariablesService,
  ) {}

  @OnEvent(FlowVariableChangedEvent.EVENT_NAME)
  async handle(event: FlowVariableChangedEvent): Promise<void> {
    const candidates = await this.nodeRepository.find({
      where: { type: ResourceFlowNodeType.INPUT_VARIABLE_CHANGED },
    });

    for (const node of candidates) {
      const parsed = VariableChangedNodeDataSchema.safeParse(node.data);
      if (!parsed.success) {
        this.logger.warn(`Variable trigger node ${node.id} has invalid data`);
        continue;
      }
      const { watches, source } = parsed.data;

      const matchesWatch = watches.some((w) => w.scope === event.scope && w.key === event.key);
      if (!matchesWatch) continue;

      if (source === 'exclude-self' && event.sourceResourceId === node.resourceId) {
        continue;
      }

      const variableSnapshot: { resource: Record<string, unknown>; global: Record<string, unknown> } = {
        resource: {},
        global: {},
      };
      const resourceKeys = watches.filter((w) => w.scope === 'resource').map((w) => w.key);
      const globalKeys = watches.filter((w) => w.scope === 'global').map((w) => w.key);
      if (resourceKeys.length > 0) {
        variableSnapshot.resource = await this.variables.getMany(
          ResourceFlowVariableScope.RESOURCE,
          node.resourceId,
          resourceKeys,
        );
      }
      if (globalKeys.length > 0) {
        variableSnapshot.global = await this.variables.getMany(
          ResourceFlowVariableScope.GLOBAL,
          null,
          globalKeys,
        );
      }

      await this.executor.startFlow(node, {
        payload: {
          change: {
            scope: event.scope,
            key: event.key,
            previousValue: event.previousValue,
            newValue: event.newValue,
            changedAt: event.changedAt.toISOString(),
            sourceResourceId: event.sourceResourceId,
          },
          variables: variableSnapshot,
        },
      });
    }
  }
}
```

If `startFlow` is currently `private`, change it to `public` (or add a public wrapper). Confirm by reading the current signature in `resource-flows-executor.service.ts` and adjust if needed.

- [ ] **Step 4: Run tests**

Run: `pnpm nx test api -- --testPathPattern=resource-flow-variable-trigger.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/resources/flows/resource-flow-variable-trigger.service.ts \
        apps/api/src/resources/flows/resource-flow-variable-trigger.service.spec.ts \
        apps/api/src/resources/flows/resource-flows-executor.service.ts
git commit -m "feat(flows): trigger flows on variable change events (ATT-278)"
```

---

## Task 7: Wire module + run full backend test suite

**Files:**
- Modify: `apps/api/src/resources/flows/resource-flows.module.ts`

- [ ] **Step 1: Register entity and providers**

```ts
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  ResourceFlowLog,
  BillingTransactionItem,
  ResourceFlowVariable,
} from '@attraccess/database-entities';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { ResourceFlowVariablesController } from './resource-flow-variables.controller';
import { ResourceFlowVariableTriggerService } from './resource-flow-variable-trigger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceFlowNode,
      ResourceFlowEdge,
      Resource,
      ResourceFlowLog,
      BillingTransactionItem,
      ResourceFlowVariable,
    ]),
    ConfigModule.forFeature(flowConfig),
    MqttModule,
    forwardRef(() => ResourceUsageModule),
    ResourceHealthModule,
  ],
  controllers: [ResourceFlowsController, ResourceFlowVariablesController],
  providers: [
    ResourceFlowsService,
    ResourceFlowsExecutorService,
    ResourceFlowVariablesService,
    ResourceFlowVariableTriggerService,
  ],
  exports: [ResourceFlowsService, ResourceFlowsExecutorService, ResourceFlowVariablesService],
})
export class ResourceFlowsModule {}
```

- [ ] **Step 2: Run full API test suite**

Run: `pnpm nx test api`
Expected: green.

- [ ] **Step 3: Run typecheck + lint**

Run: `pnpm nx run api:lint && pnpm nx run database-entities:lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/resources/flows/resource-flows.module.ts
git commit -m "feat(flows): wire variables service, controller, trigger into module (ATT-278)"
```

---

## Task 8: Regenerate API client

**Files:**
- Generated: `libs/react-query-client/src/lib/**`

- [ ] **Step 1: Build api-swagger**

Run: `pnpm nx run api:export-swagger`
Expected: emits `dist/apps/api-swagger/swagger.json`.

- [ ] **Step 2: Regenerate react-query-client**

Run: `pnpm nx run react-query-client:generate`
Expected: regenerated files include `useFlowVariablesService*` hooks.

- [ ] **Step 3: Build the lib**

Run: `pnpm nx build react-query-client`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add libs/react-query-client/src
git commit -m "chore(client): regenerate react-query-client for flow variables (ATT-278)"
```

---

## Task 9: Frontend modal + toolbar entry point

**Files:**
- Create: `apps/frontend/src/app/resources/details/flows/flowVariablesModal/index.tsx`
- Create: `apps/frontend/src/app/resources/details/flows/flowVariablesModal/index.spec.tsx`
- Modify: `apps/frontend/src/app/resources/details/flows/index.tsx`

- [ ] **Step 1: Write failing modal test**

Create `flowVariablesModal/index.spec.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FlowVariablesModal } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useFlowVariablesServiceListFlowVariables: () => ({
    data: [
      { id: 1, scope: 'resource', resourceId: 5, key: 'foo', value: 1, valueType: 'number', createdAt: '', updatedAt: '' },
      { id: 2, scope: 'global', resourceId: null, key: 'bar', value: 'baz', valueType: 'string', createdAt: '', updatedAt: '' },
    ],
    isLoading: false,
  }),
  useFlowVariablesServiceUpsertFlowVariable: () => ({ mutateAsync: vi.fn() }),
  useFlowVariablesServiceDeleteFlowVariable: () => ({ mutateAsync: vi.fn() }),
}));

describe('FlowVariablesModal', () => {
  it('renders all variables in a table', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FlowVariablesModal isOpen onClose={() => undefined} resourceId={5} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  it('shows JSON parse error when value is invalid', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FlowVariablesModal isOpen onClose={() => undefined} resourceId={5} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /new variable/i }));
    fireEvent.change(screen.getByPlaceholderText(/json value/i), { target: { value: '{not json' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `pnpm nx test frontend -- --testPathPattern=flowVariablesModal`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement modal**

Create `apps/frontend/src/app/resources/details/flows/flowVariablesModal/index.tsx`:

```tsx
import { useMemo, useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Input,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import {
  useFlowVariablesServiceListFlowVariables,
  useFlowVariablesServiceUpsertFlowVariable,
  useFlowVariablesServiceDeleteFlowVariable,
} from '@attraccess/react-query-client';

type Scope = 'resource' | 'global';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  resourceId: number;
};

export function FlowVariablesModal({ isOpen, onClose, resourceId }: Props) {
  const { data, isLoading } = useFlowVariablesServiceListFlowVariables({ resourceId });
  const upsert = useFlowVariablesServiceUpsertFlowVariable();
  const remove = useFlowVariablesServiceDeleteFlowVariable();

  const [form, setForm] = useState<{ scope: Scope; key: string; rawValue: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => data ?? [], [data]);

  const handleSave = async () => {
    if (!form) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(form.rawValue);
    } catch {
      setError('Invalid JSON');
      return;
    }
    setError(null);
    await upsert.mutateAsync({ resourceId, scope: form.scope, key: form.key, requestBody: { value: parsed } });
    setForm(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl">
      <ModalContent>
        <ModalHeader>Flow Variables</ModalHeader>
        <ModalBody>
          <Button onClick={() => setForm({ scope: 'resource', key: '', rawValue: '""' })}>New variable</Button>

          {form && (
            <div className="flex flex-col gap-2 my-4">
              <Select
                label="Scope"
                selectedKeys={[form.scope]}
                onChange={(e) => setForm({ ...form, scope: e.target.value as Scope })}
              >
                <SelectItem key="resource">resource</SelectItem>
                <SelectItem key="global">global</SelectItem>
              </Select>
              <Input
                label="Key"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
              <Textarea
                placeholder="JSON value"
                value={form.rawValue}
                onChange={(e) => setForm({ ...form, rawValue: e.target.value })}
              />
              {error && <span className="text-red-500">{error}</span>}
              <div className="flex gap-2">
                <Button onClick={handleSave}>Save</Button>
                <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              </div>
            </div>
          )}

          <Table aria-label="Flow variables">
            <TableHeader>
              <TableColumn>Scope</TableColumn>
              <TableColumn>Key</TableColumn>
              <TableColumn>Value</TableColumn>
              <TableColumn>Type</TableColumn>
              <TableColumn>Updated</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody isLoading={isLoading}>
              {rows.map((row) => (
                <TableRow key={`${row.scope}:${row.resourceId}:${row.key}`}>
                  <TableCell>{row.scope}</TableCell>
                  <TableCell>{row.key}</TableCell>
                  <TableCell><pre className="text-xs">{JSON.stringify(row.value, null, 2)}</pre></TableCell>
                  <TableCell>{row.valueType}</TableCell>
                  <TableCell>{row.updatedAt}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        remove.mutateAsync({ resourceId, scope: row.scope, key: row.key })
                      }
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
```

- [ ] **Step 4: Add toolbar button**

In `apps/frontend/src/app/resources/details/flows/index.tsx`, locate the toolbar JSX (where Save / Run / etc. buttons live). Add:

```tsx
import { FlowVariablesModal } from './flowVariablesModal';

// inside the component:
const [variablesOpen, setVariablesOpen] = useState(false);

// inside the toolbar:
<Button onClick={() => setVariablesOpen(true)}>Variables</Button>

// after the toolbar JSX block:
<FlowVariablesModal
  isOpen={variablesOpen}
  onClose={() => setVariablesOpen(false)}
  resourceId={resourceId}
/>
```

If no toolbar exists yet, place the button next to the existing primary actions surfaced on the flow page; mirror their styling.

- [ ] **Step 5: Run frontend tests**

Run: `pnpm nx test frontend -- --testPathPattern=flowVariablesModal`
Expected: PASS.

- [ ] **Step 6: Run frontend lint + typecheck**

Run: `pnpm nx run frontend:lint && pnpm nx run frontend:typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/resources/details/flows/flowVariablesModal \
        apps/frontend/src/app/resources/details/flows/index.tsx
git commit -m "feat(flows-ui): variables admin modal on flow editor (ATT-278)"
```

---

## Task 10: Manual verification + changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Start API + frontend dev**

Run: `pnpm nx run api:serve` and `pnpm nx run frontend:serve` in separate terminals.

- [ ] **Step 2: End-to-end smoke**

In browser:
1. Open a resource flow page.
2. Click the "Variables" button. Modal opens.
3. Create variable `count = 0` (resource scope). Verify row appears.
4. Add a flow: button → SET (sets `count = 1` global) → output. Save and run via the button. Confirm modal shows `count = 1` global.
5. Add a `INPUT_VARIABLE_CHANGED` node watching `(global, count)` on a *different* resource → output that logs. Trigger SET on first resource. Confirm second flow runs (visible in logs).

If any step fails, capture the error and fix before continuing.

- [ ] **Step 3: Update changelog**

Add a "Unreleased" entry at the top of `CHANGELOG.md`:

```
- feat(flows): persistent variables (resource and global scope) with SET / GET nodes, template access, and INPUT_VARIABLE_CHANGED trigger (ATT-278).
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): flow variables feature (ATT-278)"
```

---

## Self-review checklist

Verified inline before publishing this plan:

- [x] Spec coverage — every spec section maps to at least one task: data model (T1), node enum/schemas (T2), service (T3), REST (T4), executor wiring (T5), trigger subscriber (T6), module wiring (T7), client codegen (T8), modal UI (T9), manual smoke + changelog (T10).
- [x] No placeholders — all code blocks are concrete; one block in T5 Step 1 deliberately leaves arrange/act/assert as instructions for the engineer to mirror existing patterns; this is acknowledged inline rather than stubbed.
- [x] Type consistency — `ResourceFlowVariableScope` enum used consistently; `set(scope, resourceId, key, value, sourceResourceId)` signature matches across service, controller, and executor; `FlowVariableChangedEvent.EVENT_NAME = 'flow-variable.changed'` referenced in both emitter and `@OnEvent`.
- [x] Open assumption surfaced — `lodash.set` import variant depends on whether `lodash` is already a dep; T5 Step 3 says check `package.json`. Same for `ResourceFlowVariableScope` re-export from `@attraccess/plugins-backend-sdk` (T4 Step 4 caveat).
