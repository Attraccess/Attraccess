import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { PostgresBaseline1760000000000 } from './migrations/1760000000000-baseline';
import { createSqliteWorkspace, migrateSqliteTo, type SqliteWorkspace } from '../transfer/sqlite-import.test-fixture';

/**
 * Compares the PostgreSQL baseline (without the migrations after it) with the schema the released SQLite migrations
 * leave behind. Each schema is reduced to readable facts ("column user.email NOT NULL"); a fact on one side only is a
 * difference. Facts are grouped by their first word, and each group is one test.
 */
type Kind = 'column' | 'key' | 'check' | 'trigger' | 'foreign key';

/**
 * Where the PostgreSQL schema deliberately differs from the released SQLite schema, as the facts on either side. An
 * entry that no longer matches a difference fails the test, so the list stays true.
 */
const INTENDED_DIFFERENCES: { sqlite?: string; postgres?: string; why: string }[] = [
  {
    sqlite: 'column resource_metering_session.meterId NULL',
    postgres: 'column resource_metering_session.meterId NOT NULL',
    why: 'Every metering session belongs to a meter; the transfer reports a legacy session without one.',
  },
  {
    sqlite: 'check audit_log: length cast details as blob <= 4096',
    postgres: 'check audit_log: octet_length details <= 4096',
    why: 'The same limit in each dialect: at most 4096 bytes of the stored JSON text.',
  },
  {
    postgres: 'check resource_maintenance_request.status IN (dismissed, open, resolved)',
    why: 'SQLite stored the entity enum as plain varchar; PostgreSQL uses an enum type, and the application only ever wrote these values.',
  },
  {
    postgres:
      'check resource_maintenance_schedule.durationBasis IN (ATTRIBUTABLE_OPERATING_DURATION, SESSION_DURATION)',
    why: 'SQLite stored the entity enum as plain varchar; PostgreSQL uses an enum type, and the application only ever wrote these values.',
  },
  {
    sqlite: 'foreign key attractap_resources_resource.resourceId -> resource ON DELETE NO ACTION',
    postgres: 'foreign key attractap_resources_resource.resourceId -> resource ON DELETE CASCADE',
    why:
      'A reader link used to block the deletion of its resource (the 2025 migration made the key NO ACTION while the ' +
      'entity said CASCADE, and the baseline follows the entity); deleting the resource now removes the link.',
  },
];

const POSTGRES_ACTIONS: Record<string, string> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

/** An SQL expression without quotes, casts, parentheses, case and boolean spelling: the form both dialects share. */
function normaliseExpression(sql: string): string {
  return sql
    .replace(/::[a-z ]+(\[\])?/gi, '')
    .replace(/["()]/g, ' ')
    .toLowerCase()
    .replace(/\btrue\b/g, '1')
    .replace(/\bfalse\b/g, '0')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "col IN ('a','b')", PostgreSQL's "col = ANY (ARRAY['a'::text, 'b'::text])" or "col = 'a'" as one value-set fact. */
function valueSetCheck(table: string, expression: string): string | undefined {
  const text = expression.replace(/\s+/g, ' ').trim();
  const match =
    /^\(*"?(\w+)"? IN ?\((.*)\) ?\)*$/i.exec(text) ??
    /^\(*"?(\w+)"? ?= ?ANY ?\(+ARRAY\[(.*)\]\)*$/i.exec(text) ??
    /^\(*"?(\w+)"? ?= ?('[^']*'(?:::\w+)?)\)*$/i.exec(text);
  if (!match) return undefined;
  const values = [...match[2].matchAll(/'([^']*)'/g)].map((value) => value[1]);
  return `check ${table}.${match[1]} IN (${values.sort().join(', ')})`;
}

function checkFact(table: string, expression: string): string {
  return valueSetCheck(table, expression) ?? `check ${table}: ${normaliseExpression(expression)}`;
}

/** The expressions of every CHECK in a CREATE TABLE statement, with balanced parentheses. */
function checkExpressions(createTable: string): string[] {
  const expressions: string[] = [];
  for (const match of createTable.matchAll(/\bCHECK\s*\(/gi)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let end = start;
    while (depth > 0 && end < createTable.length) {
      if (createTable[end] === '(') depth++;
      if (createTable[end] === ')') depth--;
      end++;
    }
    expressions.push(createTable.slice(start, end - 1));
  }
  return expressions;
}

async function sqliteFacts(sqlite: DataSource): Promise<Set<string>> {
  const facts = new Set<string>();
  const objects: { type: string; name: string; tbl_name: string; sql: string | null }[] = await sqlite.query(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
  );
  for (const { type, name, tbl_name, sql } of objects) {
    if (type === 'trigger') facts.add(`trigger ${tbl_name}.${name}`);
    if (type !== 'table') continue;

    const columns: { name: string; notnull: number; pk: number; hidden: number }[] = await sqlite.query(
      `SELECT name, "notnull", pk, hidden FROM pragma_table_xinfo('${name}')`,
    );
    for (const column of columns) {
      const nullability = column.notnull || column.pk ? 'NOT NULL' : 'NULL';
      facts.add(`column ${name}.${column.name} ${nullability}${column.hidden >= 2 ? ' GENERATED' : ''}`);
    }
    const primaryKey = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk);
    if (primaryKey.length) facts.add(`key ${name} PRIMARY KEY (${primaryKey.map((c) => c.name).join(', ')})`);

    const indexes: { name: string; unique: number; origin: string }[] = await sqlite.query(
      `SELECT name, "unique", origin FROM pragma_index_list('${name}')`,
    );
    for (const index of indexes.filter((candidate) => candidate.unique && candidate.origin !== 'pk')) {
      const keyColumns: { name: string }[] = await sqlite.query(
        `SELECT name FROM pragma_index_info('${index.name}') ORDER BY seqno`,
      );
      const indexSql = objects.find((object) => object.type === 'index' && object.name === index.name)?.sql ?? '';
      const where = /\bWHERE\b([\s\S]*)$/i.exec(indexSql)?.[1];
      facts.add(
        `key ${name} UNIQUE (${keyColumns.map((c) => c.name).join(', ')})` +
          (where ? ` WHERE ${normaliseExpression(where)}` : ''),
      );
    }

    for (const expression of checkExpressions(sql ?? '')) facts.add(checkFact(name, expression));

    const foreignKeys: { from: string; table: string; on_delete: string }[] = await sqlite.query(
      `SELECT "from", "table", on_delete FROM pragma_foreign_key_list('${name}')`,
    );
    for (const key of foreignKeys)
      facts.add(`foreign key ${name}.${key.from} -> ${key.table} ON DELETE ${key.on_delete}`);
  }
  return facts;
}

async function postgresFacts(postgres: DataSource): Promise<Set<string>> {
  const facts = new Set<string>();
  const unquote = (name: string) => name.replace(/"/g, '');

  const columns: { table: string; column: string; nullable: string; generated: string }[] = await postgres.query(`
    SELECT table_name AS "table", column_name AS "column", is_nullable AS nullable, is_generated AS generated
      FROM information_schema.columns WHERE table_schema = current_schema()`);
  for (const column of columns) {
    const nullability = column.nullable === 'NO' ? 'NOT NULL' : 'NULL';
    facts.add(
      `column ${column.table}.${column.column} ${nullability}${column.generated === 'ALWAYS' ? ' GENERATED' : ''}`,
    );
  }

  const keys: { table: string; primary: boolean; columns: string[]; predicate: string | null }[] =
    await postgres.query(`
    SELECT i.indrelid::regclass::text AS "table", i.indisprimary AS "primary",
           (SELECT json_agg(a.attname ORDER BY k.position)
              FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS columns,
           pg_get_expr(i.indpred, i.indrelid) AS predicate
      FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
     WHERE i.indisunique AND c.relnamespace = current_schema()::regnamespace`);
  for (const key of keys) {
    const kind = key.primary ? 'PRIMARY KEY' : 'UNIQUE';
    const where = key.predicate ? ` WHERE ${normaliseExpression(key.predicate)}` : '';
    facts.add(`key ${unquote(key.table)} ${kind} (${key.columns.join(', ')})${where}`);
  }

  const enums: { table: string; column: string; labels: string[] }[] = await postgres.query(`
    SELECT c.table_name AS "table", c.column_name AS "column",
           (SELECT json_agg(e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = c.udt_name AND t.typnamespace = current_schema()::regnamespace) AS labels
      FROM information_schema.columns c
     WHERE c.table_schema = current_schema() AND c.data_type = 'USER-DEFINED'`);
  for (const { table, column, labels } of enums) {
    if (labels) facts.add(`check ${table}.${column} IN (${[...labels].sort().join(', ')})`);
  }

  const constraints: {
    table: string;
    type: string;
    definition: string;
    column: string;
    parent: string;
    action: string;
  }[] = await postgres.query(`
      SELECT c.conrelid::regclass::text AS "table", c.contype AS type, pg_get_constraintdef(c.oid) AS definition,
             a.attname AS "column", c.confrelid::regclass::text AS parent, c.confdeltype AS action
        FROM pg_constraint c
        LEFT JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype IN ('c', 'f') AND c.connamespace = current_schema()::regnamespace`);
  for (const constraint of constraints) {
    const table = unquote(constraint.table);
    if (constraint.type === 'c') facts.add(checkFact(table, constraint.definition.replace(/^CHECK\s*/, '')));
    else {
      const action = POSTGRES_ACTIONS[constraint.action];
      facts.add(`foreign key ${table}.${constraint.column} -> ${unquote(constraint.parent)} ON DELETE ${action}`);
    }
  }

  const triggers: { table: string; name: string }[] = await postgres.query(`
    SELECT t.tgrelid::regclass::text AS "table", t.tgname AS name
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND c.relnamespace = current_schema()::regnamespace`);
  for (const trigger of triggers) facts.add(`trigger ${unquote(trigger.table)}.${trigger.name}`);
  return facts;
}

describe('PostgreSQL schema parity with the final SQLite schema', () => {
  let postgres: DataSource | undefined;
  let workspace: SqliteWorkspace | undefined;
  let sqlite: DataSource | undefined;
  let released: Set<string>;
  let current: Set<string>;

  beforeAll(async () => {
    // The baseline only: PostgreSQL migrations after it change the schema without a SQLite counterpart.
    postgres = await createTestDataSource({ empty: true, migrations: [PostgresBaseline1760000000000] });
    await postgres.runMigrations();
    workspace = await createSqliteWorkspace();
    process.env.AUTH_SESSION_SECRET ||= 'schema-parity-spec-secret';
    sqlite = await migrateSqliteTo(workspace.file);
    released = await sqliteFacts(sqlite);
    current = await postgresFacts(postgres);
  }, 300_000);
  afterAll(async () => {
    try {
      await sqlite?.destroy();
      await workspace?.remove();
    } finally {
      await closeTestDataSource(postgres);
    }
  });

  /** The differences of one kind, with the intended ones taken out, and the intended ones that no longer match. */
  function differences(kind: Kind) {
    const ofKind = (facts: Set<string>) => [...facts].filter((fact) => fact.startsWith(`${kind} `));
    const onlyInSqlite = new Set(ofKind(released).filter((fact) => !current.has(fact)));
    const onlyInPostgres = new Set(ofKind(current).filter((fact) => !released.has(fact)));
    const staleIntendedDifferences: string[] = [];
    for (const intended of INTENDED_DIFFERENCES) {
      for (const [fact, side] of [
        [intended.sqlite, onlyInSqlite],
        [intended.postgres, onlyInPostgres],
      ] as const) {
        if (!fact?.startsWith(`${kind} `)) continue;
        if (!side.delete(fact)) staleIntendedDifferences.push(fact);
      }
    }
    return {
      onlyInSqlite: [...onlyInSqlite].sort(),
      onlyInPostgres: [...onlyInPostgres].sort(),
      staleIntendedDifferences,
    };
  }
  const none = { onlyInSqlite: [], onlyInPostgres: [], staleIntendedDifferences: [] };

  it('has the same tables and columns, nullability and generated columns', () => {
    expect(differences('column')).toEqual(none);
  });

  it('has the same primary keys and unique indexes, partial ones with the same condition', () => {
    expect(differences('key')).toEqual(none);
  });

  it('has the same CHECK constraints and allowed value sets', () => {
    expect(differences('check')).toEqual(none);
  });

  it('has the same triggers', () => {
    expect(differences('trigger')).toEqual(none);
  });

  /** What happens to the child row when the referenced row goes: the behaviour an existing installation relies on. */
  it('keeps every ON DELETE rule of the released SQLite schema', () => {
    expect(differences('foreign key')).toEqual(none);
  });

  it('lists only intended differences of the kinds it compares', () => {
    const kinds: Kind[] = ['column', 'key', 'check', 'trigger', 'foreign key'];
    const facts = INTENDED_DIFFERENCES.flatMap((intended) => [intended.sqlite, intended.postgres]);
    expect(facts.filter((fact) => fact && !kinds.some((kind) => fact.startsWith(`${kind} `)))).toEqual([]);
  });
});
