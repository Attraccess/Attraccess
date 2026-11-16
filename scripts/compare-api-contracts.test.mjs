import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareContracts, contractKind, formatReport, main } from './compare-api-contracts.mjs';

const script = fileURLToPath(new URL('./compare-api-contracts.mjs', import.meta.url));

const baseApi = () => ({
  openapi: '3.0.0',
  info: { title: 'Attraccess', version: '1.0.0', description: 'one' },
  paths: {
    '/api/resources': {
      get: {
        operationId: 'listResources',
        summary: 'List',
        tags: ['Resources'],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'number' }, description: 'page' },
          { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Resource' } } },
          },
          401: { description: 'no' },
        },
      },
      post: {
        operationId: 'createResource',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateResource' } } },
        },
        responses: { 201: { description: 'created' } },
      },
    },
    '/api/legacy': { get: { operationId: 'legacy', responses: { 200: { description: 'ok' } } } },
  },
  components: {
    schemas: {
      Resource: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'number', description: 'id' },
          name: { type: 'string', example: 'Laser' },
          tags: { type: 'array', items: { type: 'string' } },
          state: { type: 'string', enum: ['idle', 'busy'] },
        },
      },
      CreateResource: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
    },
  },
});

const differences = (mutate) => {
  const head = baseApi();
  mutate(head);
  return compareContracts(baseApi(), head);
};
const only = (list) => {
  assert.equal(list.length, 1, JSON.stringify(list));
  return list[0];
};

test('identical contracts, and changes to descriptions, examples, titles, tags, servers, info and key order, are no difference', () => {
  const head = baseApi();
  head.info = { version: '9.9.9', title: 'Renamed', description: 'two' };
  head.servers = [{ url: 'http://example.test' }];
  head.tags = [{ name: 'Resources' }];
  head.paths['/api/resources'].get.summary = 'List all';
  head.paths['/api/resources'].get.tags = ['Other'];
  head.paths['/api/resources'].get.parameters[0].description = 'changed';
  head.components.schemas.Resource.properties.name.example = 'Printer';
  head.components.schemas.Resource.properties.id.description = 'changed';
  head.components.schemas.Resource['x-internal'] = true;
  head.components.schemas.Resource.required = ['name', 'id'];
  head.paths = Object.fromEntries(Object.entries(head.paths).reverse());
  assert.deepEqual(compareContracts(baseApi(), head), []);
  assert.equal(formatReport([]), 'No meaningful differences between base and head.');
});

test('a property called "tags" or "description" is a property, not documentation', () => {
  const head = baseApi();
  delete head.components.schemas.Resource.properties.tags;
  const difference = only(compareContracts(baseApi(), head));
  assert.deepEqual(difference, { severity: 'breaking', message: 'schema Resource > tags: removed' });
});

test('removed paths, methods and responses are breaking, new ones are additive', () => {
  assert.deepEqual(only(differences((head) => delete head.paths['/api/legacy'])), {
    severity: 'breaking',
    message: '/api/legacy: removed',
  });
  assert.deepEqual(only(differences((head) => delete head.paths['/api/resources'].post)), {
    severity: 'breaking',
    message: 'POST /api/resources: removed',
  });
  assert.deepEqual(only(differences((head) => delete head.paths['/api/resources'].get.responses[401])), {
    severity: 'breaking',
    message: 'GET /api/resources > responses > 401: removed',
  });
  assert.deepEqual(only(differences((head) => (head.paths['/api/new'] = { get: { responses: {} } }))), {
    severity: 'added',
    message: '/api/new: added',
  });
});

test('parameters are matched by location and name: required additions break, optional ones are additive', () => {
  assert.deepEqual(
    only(
      differences((head) =>
        head.paths['/api/resources'].get.parameters.push({
          name: 'must',
          in: 'query',
          required: true,
          schema: { type: 'string' },
        }),
      ),
    ),
    { severity: 'breaking', message: 'GET /api/resources > parameters > query:must: added' },
  );
  assert.equal(
    only(
      differences((head) =>
        head.paths['/api/resources'].get.parameters.push({ name: 'may', in: 'header', required: false }),
      ),
    ).severity,
    'added',
  );
  assert.equal(only(differences((head) => head.paths['/api/resources'].get.parameters.pop())).severity, 'breaking');
  assert.deepEqual(only(differences((head) => (head.paths['/api/resources'].get.parameters[0].required = true))), {
    severity: 'breaking',
    message: 'GET /api/resources > parameters > query:page > required: false -> true',
  });
  const reordered = baseApi();
  reordered.paths['/api/resources'].get.parameters.reverse();
  assert.deepEqual(compareContracts(baseApi(), reordered), []);
});

test('type, $ref, format and operationId changes are breaking', () => {
  assert.deepEqual(only(differences((head) => (head.components.schemas.Resource.properties.id.type = 'string'))), {
    severity: 'breaking',
    message: 'schema Resource > id > type: number -> string',
  });
  assert.equal(
    only(
      differences(
        (head) =>
          (head.paths['/api/resources'].get.responses[200].content['application/json'].schema.$ref =
            '#/components/schemas/CreateResource'),
      ),
    ).severity,
    'breaking',
  );
  assert.equal(
    only(differences((head) => (head.paths['/api/resources'].get.operationId = 'findResources'))).severity,
    'breaking',
  );
  const formatted = baseApi();
  formatted.components.schemas.Resource.properties.id.format = 'int32';
  const reformatted = JSON.parse(JSON.stringify(formatted));
  reformatted.components.schemas.Resource.properties.id.format = 'int64';
  assert.equal(only(compareContracts(formatted, reformatted)).severity, 'breaking');
  // A format that was not declared before is a refinement, for review only.
  assert.equal(
    only(differences((head) => (head.components.schemas.Resource.properties.id.format = 'int64'))).severity,
    'changed',
  );
});

test('schemas and properties: removal breaks, addition is additive', () => {
  assert.equal(only(differences((head) => delete head.components.schemas.CreateResource)).severity, 'breaking');
  assert.deepEqual(only(differences((head) => (head.components.schemas.Extra = { type: 'object' }))), {
    severity: 'added',
    message: 'schema Extra: added',
  });
  assert.deepEqual(
    only(differences((head) => (head.components.schemas.Resource.properties.owner = { type: 'string' }))),
    {
      severity: 'added',
      message: 'schema Resource > owner: added',
    },
  );
});

test('required fields: a new required input breaks, other changes are for review', () => {
  assert.deepEqual(only(differences((head) => head.components.schemas.CreateResource.required.push('type'))), {
    severity: 'changed',
    message: 'schema CreateResource: required entry added (type)',
  });
  const request = baseApi();
  request.paths['/api/resources'].post.requestBody.content['application/json'].schema = {
    type: 'object',
    required: ['a'],
    properties: { a: { type: 'string' } },
  };
  const requestHead = JSON.parse(JSON.stringify(request));
  requestHead.paths['/api/resources'].post.requestBody.content['application/json'].schema.required.push('b');
  assert.equal(only(compareContracts(request, requestHead)).severity, 'breaking');
  const responseHead = JSON.parse(JSON.stringify(request));
  responseHead.paths['/api/resources'].get.responses[200].content['application/json'].schema = {
    type: 'object',
    required: ['a'],
  };
  const responseBase = JSON.parse(JSON.stringify(responseHead));
  responseHead.paths['/api/resources'].get.responses[200].content['application/json'].schema.required.push('b');
  assert.equal(only(compareContracts(responseBase, responseHead)).severity, 'added');
  responseHead.paths['/api/resources'].get.responses[200].content['application/json'].schema.required = [];
  assert.equal(compareContracts(responseBase, responseHead)[0].severity, 'breaking');
});

test('enum values: removed ones break input, changed output is for review', () => {
  assert.deepEqual(only(differences((head) => (head.components.schemas.Resource.properties.state.enum = ['idle']))), {
    severity: 'breaking',
    message: 'schema Resource > state: enum entry removed (busy)',
  });
  assert.equal(
    only(differences((head) => head.components.schemas.Resource.properties.state.enum.push('error'))).severity,
    'changed',
  );
});

test('only differences are reported, grouped by severity, and the CLI can fail on breaking ones', () => {
  const head = baseApi();
  delete head.paths['/api/legacy'];
  head.components.schemas.Resource.properties.owner = { type: 'string' };
  const report = formatReport(compareContracts(baseApi(), head), { baseLabel: 'a.json', headLabel: 'b.json' });
  assert.equal(
    report,
    [
      'API contract differences a.json -> b.json',
      '',
      'BREAKING (1)',
      '  - /api/legacy: removed',
      '',
      'ADDED (1)',
      '  - schema Resource > owner: added',
    ].join('\n'),
  );

  const directory = mkdtempSync(path.join(tmpdir(), 'contracts-'));
  try {
    const baseFile = path.join(directory, 'base.json');
    const headFile = path.join(directory, 'head.json');
    writeFileSync(baseFile, JSON.stringify(baseApi()));
    writeFileSync(headFile, JSON.stringify(head));
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(run(baseFile, headFile).status, 0);
    assert.equal(run(baseFile, headFile, '--fail-on-breaking').status, 1);
    assert.equal(run(baseFile, baseFile, '--fail-on-breaking').status, 0);
    assert.deepEqual(
      JSON.parse(run(baseFile, headFile, '--json').stdout).map((entry) => entry.severity),
      ['breaking', 'added'],
    );
    assert.equal(run(baseFile, path.join(directory, 'missing.json')).status, 2);
    assert.equal(run(baseFile).status, 2);
    assert.match(run(baseFile, headFile, '--bogus').stderr, /usage/);
    const lines = [];
    assert.equal(
      main([baseFile, baseFile], (line) => lines.push(line)),
      0,
    );
    assert.deepEqual(lines, [`No meaningful differences between ${baseFile} and ${baseFile}.`]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const baseAsync = () => ({
  asyncapi: '2.6.0',
  info: { title: 'Companion', version: '1' },
  channels: {
    'device.status': {
      description: 'status',
      subscribe: { message: { $ref: '#/components/messages/Status' } },
    },
    'device.command': { publish: { message: { $ref: '#/components/messages/Command' } } },
  },
  components: {
    messages: {
      Status: { payload: { type: 'object', required: ['online'], properties: { online: { type: 'boolean' } } } },
      Command: { payload: { type: 'object', properties: { name: { type: 'string' } } } },
    },
  },
});

test('asyncapi: channels, operations, messages and payload fields are compared the same way', () => {
  assert.equal(contractKind(baseAsync()), 'asyncapi');
  const head = baseAsync();
  delete head.channels['device.command'];
  head.channels['device.log'] = { subscribe: {} };
  head.components.messages.Status.payload.properties.online.type = 'string';
  head.components.messages.Command.payload.properties.extra = { type: 'string' };
  assert.deepEqual(compareContracts(baseAsync(), head), [
    { severity: 'breaking', message: 'channel device.command: removed' },
    { severity: 'added', message: 'channel device.log: added' },
    { severity: 'breaking', message: 'messages Status > payload > online > type: boolean -> string' },
    { severity: 'added', message: 'messages Command > payload > extra: added' },
  ]);
});

test('documents of different kinds, or no contract at all, are refused', () => {
  assert.throws(() => compareContracts(baseApi(), baseAsync()), /cannot compare a openapi document with a asyncapi/);
  assert.throws(() => compareContracts({}, {}), /not a swagger/);
});
