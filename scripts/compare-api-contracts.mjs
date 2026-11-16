/* eslint-disable no-console -- CLI output. */
// Compares two generated API contracts (swagger.json / asyncapi.json) and prints only the differences that matter to
// a client: paths, methods, parameters, bodies, responses, schemas, properties, required fields, enums and types.
// Descriptions, examples, titles, tags, server lists, the document version and key order are not differences.
//
//   node scripts/compare-api-contracts.mjs <base.json> <head.json> [--json] [--fail-on-breaking]
//
// Generate both files from the commits to compare (`pnpm nx run api:export-swagger`, `api:export-asyncapi`) and keep
// them outside the repository: generated contracts are never committed. See docs/en/developer/persistence-architecture.md.
//
// Severity (the contract has no direction, so the rules say what a client could trip over):
//   breaking  something a client may rely on is gone or stricter: path, method, parameter, property, response, schema
//             or enum value removed (enum values only for input), a type or $ref changed, a required parameter or input
//             property added, an optional input made required, an operationId renamed.
//   changed   worth a review but not necessarily breaking: output enum value added or removed, required list of a shared
//             schema changed, constraints, defaults and formats changed, deprecation.
//   added     purely additive: new path, method, schema, property, optional parameter, response, enum value on input.
// Exit status: 0, or 1 with --fail-on-breaking when something is breaking, or 2 on unreadable input.
import { readFileSync } from 'node:fs';

/** Keys that describe the contract to humans or to the document, never its behaviour. */
const IGNORED = new Set([
  'description',
  'summary',
  'example',
  'examples',
  'title',
  'externalDocs',
  'tags',
  'servers',
  'info',
]);
/** Containers whose keys are names chosen by the API (a property called `tags` is not documentation). */
const NAME_MAPS = new Set([
  'properties',
  'patternProperties',
  'paths',
  'channels',
  'operations',
  'schemas',
  'messages',
  'responses',
  'content',
  'headers',
  'parameters',
  'requestBodies',
  'securitySchemes',
  'definitions',
]);
const SET_ARRAYS = new Set(['required', 'enum', 'type']);
const BREAKING_SCALARS = new Set(['type', '$ref', 'format', 'in', 'name', 'operationId', 'nullable', 'const']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value) =>
  JSON.stringify(value, (_key, inner) =>
    isObject(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1))) : inner,
  );

/** Swagger 2 and OpenAPI 3 carry parameters as a list; a key of location and name makes them comparable. */
function keyParameters(value) {
  return Object.fromEntries(
    value.map((parameter, index) => [
      isObject(parameter) && parameter.name ? `${parameter.in ?? 'unknown'}:${parameter.name}` : `#${index}`,
      parameter,
    ]),
  );
}

function context(path) {
  if (path.includes('requestBody') || path.includes('parameters')) return 'request';
  if (path.includes('responses')) return 'response';
  return 'unknown';
}

function classify(event) {
  const { kind, path } = event;
  const ctx = context(path);
  const parent = path[path.length - 2];
  // The last segment is a keyword of a node unless it is a name inside a name map (a property called `default`).
  const key = NAME_MAPS.has(parent) ? undefined : path[path.length - 1];
  if (event.set === 'enum') {
    if (kind === 'removed') return ctx === 'response' ? 'changed' : 'breaking';
    return ctx === 'request' ? 'added' : 'changed';
  }
  if (event.set === 'required') {
    if (kind === 'added') return ctx === 'request' ? 'breaking' : ctx === 'response' ? 'added' : 'changed';
    return ctx === 'response' ? 'breaking' : 'changed';
  }
  if (event.set === 'type') return 'breaking';
  if (kind === 'removed')
    return ['default', 'deprecated', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern'].includes(key)
      ? 'changed'
      : 'breaking';
  if (kind === 'added') {
    if (parent === 'parameters' && isObject(event.to) && event.to.required === true) return 'breaking';
    return [
      'default',
      'deprecated',
      'minimum',
      'maximum',
      'minLength',
      'maxLength',
      'pattern',
      'additionalProperties',
      'format',
      'nullable',
      'const',
    ].includes(key)
      ? 'changed'
      : 'added';
  }
  if (key === 'required' && event.from === false && event.to === true)
    return ctx === 'request' ? 'breaking' : 'changed';
  if (BREAKING_SCALARS.has(key)) return 'breaking';
  return 'changed';
}

function diffSet(path, name, a, b, events) {
  const left = new Map(a.map((item) => [canonical(item), item]));
  const right = new Map(b.map((item) => [canonical(item), item]));
  for (const [id, item] of left)
    if (!right.has(id)) events.push({ kind: 'removed', path: [...path, name], set: name, value: item });
  for (const [id, item] of right)
    if (!left.has(id)) events.push({ kind: 'added', path: [...path, name], set: name, value: item });
}

function diffArray(path, key, a, b, events) {
  if (SET_ARRAYS.has(key)) return diffSet(path, key, a, b, events);
  // Other lists (allOf, oneOf, anyOf, security, ...) are alternatives: compare them as sets of whole elements.
  const left = new Set(a.map(canonical));
  const right = new Set(b.map(canonical));
  const removed = a.filter((item) => !right.has(canonical(item)));
  const added = b.filter((item) => !left.has(canonical(item)));
  if (removed.length > 0 || added.length > 0) {
    events.push({
      kind: 'changed',
      path: [...path, key],
      from: removed.length ? removed : undefined,
      to: added.length ? added : undefined,
      alternatives: true,
    });
  }
}

function walk(path, a, b, keysAreNames, events) {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!keysAreNames && (IGNORED.has(key) || key.startsWith('x-'))) continue;
    const here = [...path, key];
    let left = a[key];
    let right = b[key];
    if (!keysAreNames && key === 'parameters') {
      left = Array.isArray(left) ? keyParameters(left) : left;
      right = Array.isArray(right) ? keyParameters(right) : right;
    }
    if (left === undefined) events.push({ kind: 'added', path: here, to: right });
    else if (right === undefined) events.push({ kind: 'removed', path: here, from: left });
    else if (isObject(left) && isObject(right)) walk(here, left, right, !keysAreNames && NAME_MAPS.has(key), events);
    else if (Array.isArray(left) && Array.isArray(right)) diffArray(path, key, left, right, events);
    else if (canonical(left) !== canonical(right)) events.push({ kind: 'changed', path: here, from: left, to: right });
  }
}

/** Where the value sits, in the words of the document: `GET /api/x`, `schema Foo`, `channel bar`. */
function locate(path) {
  const [root, name, ...rest] = path;
  if (root === 'paths' && name !== undefined) {
    const [method, ...tail] = rest;
    return { subject: method ? `${method.toUpperCase()} ${name}` : name, tail };
  }
  if (root === 'components' && name === 'schemas')
    return { subject: `schema ${rest[0] ?? ''}`.trim(), tail: rest.slice(1) };
  if (root === 'definitions') return { subject: `schema ${name ?? ''}`.trim(), tail: rest };
  if (root === 'components' && name) return { subject: `${name} ${rest[0] ?? ''}`.trim(), tail: rest.slice(1) };
  if (root === 'channels' && name !== undefined) return { subject: `channel ${name}`, tail: rest };
  if (root === 'operations' && name !== undefined) return { subject: `operation ${name}`, tail: rest };
  return { subject: root ?? 'document', tail: path.slice(1) };
}

const brief = (value) => {
  if (value === undefined) return '';
  if (isObject(value) && typeof value.$ref === 'string') return value.$ref.split('/').pop();
  if (isObject(value) && typeof value.type === 'string') return value.type;
  const text = typeof value === 'string' ? value : canonical(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
};

function describe(event) {
  const { subject, tail } = locate(event.set ? event.path.slice(0, -1) : event.path);
  const where = tail.filter((segment) => segment !== 'properties').join(' > ');
  const target = where ? `${subject} > ${where}` : subject;
  if (event.set) return `${target}: ${event.set} entry ${event.kind} (${brief(event.value)})`;
  if (event.alternatives) return `${target}: alternatives changed (${brief(event.from)} -> ${brief(event.to)})`;
  if (event.kind === 'added')
    return `${target}: added${event.to !== undefined && !isObject(event.to) ? ` (${brief(event.to)})` : ''}`;
  if (event.kind === 'removed') return `${target}: removed`;
  return `${target}: ${brief(event.from)} -> ${brief(event.to)}`;
}

/** Contract kind by its marker: `swagger`/`openapi` or `asyncapi`. */
export function contractKind(document) {
  if (isObject(document) && (document.openapi || document.swagger)) return 'openapi';
  if (isObject(document) && document.asyncapi) return 'asyncapi';
  throw new Error('not a swagger/openapi or asyncapi document');
}

/** Meaningful differences between two parsed contracts, in document order, each with a severity. */
export function compareContracts(base, head) {
  if (contractKind(base) !== contractKind(head)) {
    throw new Error(`cannot compare a ${contractKind(base)} document with a ${contractKind(head)} document`);
  }
  const events = [];
  walk([], base, head, false, events);
  return events.map((event) => ({ severity: classify(event), message: describe(event) }));
}

export const SEVERITIES = ['breaking', 'changed', 'added'];

export function formatReport(differences, { baseLabel = 'base', headLabel = 'head' } = {}) {
  if (differences.length === 0) return `No meaningful differences between ${baseLabel} and ${headLabel}.`;
  const lines = [`API contract differences ${baseLabel} -> ${headLabel}`];
  for (const severity of SEVERITIES) {
    const group = differences.filter((difference) => difference.severity === severity);
    if (group.length === 0) continue;
    lines.push(
      '',
      `${severity.toUpperCase()} (${group.length})`,
      ...group.map((difference) => `  - ${difference.message}`),
    );
  }
  return lines.join('\n');
}

function load(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
}

export function main(argv, out = console.log) {
  const flags = argv.filter((argument) => argument.startsWith('--'));
  const files = argv.filter((argument) => !argument.startsWith('--'));
  const unknown = flags.filter((flag) => !['--json', '--fail-on-breaking'].includes(flag));
  if (files.length !== 2 || unknown.length > 0) {
    throw new Error(
      'usage: node scripts/compare-api-contracts.mjs <base.json> <head.json> [--json] [--fail-on-breaking]',
    );
  }
  const differences = compareContracts(load(files[0]), load(files[1]));
  out(
    flags.includes('--json')
      ? JSON.stringify(differences, null, 2)
      : formatReport(differences, { baseLabel: files[0], headLabel: files[1] }),
  );
  return flags.includes('--fail-on-breaking') && differences.some((difference) => difference.severity === 'breaking')
    ? 1
    : 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
