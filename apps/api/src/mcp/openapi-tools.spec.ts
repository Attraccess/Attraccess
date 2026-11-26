import { generateMcpTools, OpenApiDocument } from './openapi-tools';

const AUTH = { all: [], any: [], sessionOnly: false };
const json = { content: { 'application/json': {} } };

/** One-path document whose operations carry the given auth metadata (a signed-in route by default). */
function documentOf(operations: Record<string, Record<string, unknown>>, path = '/things'): OpenApiDocument {
  return {
    paths: {
      [path]: Object.fromEntries(
        Object.entries(operations).map(([method, operation]) => [
          method,
          { 'x-attraccess-auth': AUTH, responses: { '200': json }, ...operation },
        ]),
      ),
    },
  };
}

describe('generateMcpTools', () => {
  const document: OpenApiDocument = {
    paths: {
      '/resources/{id}': {
        get: {
          operationId: 'getResource',
          summary: 'Get a resource',
          'x-attraccess-auth': { all: ['resources.read'], any: [], sessionOnly: false },
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'expand', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: { '200': json },
        },
        patch: {
          operationId: 'updateResource',
          'x-attraccess-auth': { all: [], any: ['resources.update', 'resources.manage'], sessionOnly: false },
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateResource' } } },
          },
          responses: { '200': json },
        },
      },
    },
    components: {
      schemas: {
        UpdateResource: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' }, description: { type: 'string', nullable: true } },
        },
      },
    },
  };

  it('uses operation IDs, combines path, query, and body inputs and carries the auth requirement', () => {
    const { tools, skipped } = generateMcpTools(document);
    expect(skipped).toEqual([]);
    expect(tools.map(({ name }) => name)).toEqual(['getResource', 'updateResource']);
    expect(tools[0].inputSchema.required).toEqual(['id']);
    expect(tools[0].inputSchema.properties).toEqual({ id: { type: 'integer' }, expand: { type: 'boolean' } });
    expect(tools[1].inputSchema.required).toEqual(['name']);
    expect(tools[1].inputSchema.properties.name).toEqual({ type: 'string' });
    expect(tools[0].auth).toEqual({ all: ['resources.read'], any: [] });
    expect(tools[1].auth).toEqual({ all: [], any: ['resources.update', 'resources.manage'] });
  });

  it('gives an authenticated route with an empty requirement an empty auth', () => {
    const { tools } = generateMcpTools(documentOf({ get: { operationId: 'whoAmI' } }));
    expect(tools[0].auth).toEqual({ all: [], any: [] });
  });

  describe('rule-based exclusions', () => {
    const skippedReason = (doc: OpenApiDocument) => {
      const result = generateMcpTools(doc);
      expect(result.tools).toEqual([]);
      return result.skipped[0]?.reason;
    };

    it('skips operations without auth metadata (public or custom-guarded routes)', () => {
      const doc = documentOf({ get: { operationId: 'publicThing', 'x-attraccess-auth': undefined } });
      expect(skippedReason(doc)).toContain('No auth metadata');
    });

    it('skips session-only operations', () => {
      const doc = documentOf({
        get: { operationId: 'listTokens', 'x-attraccess-auth': { all: [], any: [], sessionOnly: true } },
      });
      expect(skippedReason(doc)).toBe('Session-only route');
    });

    it.each([{ all: 'resources.manage' }, { all: [], any: [1] }, { all: [], any: [], sessionOnly: 'true' }])(
      'fails closed on malformed auth metadata %j',
      (metadata) => {
        const doc = documentOf({ get: { operationId: 'oddThing', 'x-attraccess-auth': metadata } });
        expect(skippedReason(doc)).toBe('Malformed auth metadata');
      },
    );

    it('skips operations marked @NotAnMcpTool and reports the reason', () => {
      const doc = documentOf({ post: { operationId: 'setSecret', 'x-mcp-exclude': { reason: 'Secret management' } } });
      expect(skippedReason(doc)).toBe('Marked @NotAnMcpTool: Secret management');
    });

    it('skips every operation that shares a duplicated id', () => {
      const doc = documentOf({ get: { operationId: 'getThing' } });
      doc.paths = { ...doc.paths, '/other': { get: { ...(doc.paths?.['/things'].get as object) } } };
      const { tools, skipped } = generateMcpTools(doc);
      expect(tools).toEqual([]);
      expect(skipped).toHaveLength(2);
      expect(skipped.every((entry) => entry.reason.startsWith('Duplicate operationId'))).toBe(true);
    });

    it.each([undefined, '1bad', 'has-dash', 'x'.repeat(65)])('skips the invalid operation id %s', (operationId) => {
      const doc = documentOf({ get: { operationId } });
      const { tools, skipped } = generateMcpTools(doc);
      expect(tools).toEqual([]);
      expect(skipped[0]).toMatchObject({ method: 'GET', path: '/things' });
      expect(skipped[0].reason).toContain('operationId');
    });

    it('skips unsupported HTTP methods without throwing', () => {
      const doc = documentOf({ options: { operationId: 'optionsThings' } });
      expect(skippedReason(doc)).toContain('Unsupported OpenAPI operation OPTIONS');
    });

    it('checks auth before the technical exclusions', () => {
      const doc = documentOf({ get: { operationId: 'downloadThing', 'x-attraccess-auth': undefined } });
      expect(skippedReason(doc)).toContain('No auth metadata');
    });
  });

  describe('technical exclusions', () => {
    it.each([
      ['notificationsLive', '/notifications'],
      ['downloadFirmware', '/firmware/download'],
      ['rebootHost', '/host/reboot'],
      ['streamThings', '/things/stream'],
      ['getLogo', '/logo.png'],
      ['getFrontendPluginFile', '/plugins/{name}/frontend/{file}'],
      ['getReaderCrashReportCoredump', '/readers/{id}/crash-report/coredump'],
    ])('skips %s by its id or path', (operationId, path) => {
      const { tools, skipped } = generateMcpTools(documentOf({ get: { operationId } }, path));
      expect(tools).toEqual([]);
      expect(skipped[0].reason).toContain('Incompatible endpoint');
    });

    it('skips streaming and callback operations', () => {
      const streaming = documentOf({ post: { operationId: 'setMap', 'x-mcp-streaming': true } });
      expect(generateMcpTools(streaming).tools).toEqual([]);
      const callbacks = documentOf({ post: { operationId: 'setMap', callbacks: { done: {} } } });
      expect(generateMcpTools(callbacks).tools).toEqual([]);
    });

    it('skips non-JSON success responses and non-JSON request bodies', () => {
      const response = documentOf({
        post: { operationId: 'setMap', responses: { '201': { content: { 'text/event-stream': {} } } } },
      });
      expect(generateMcpTools(response).skipped[0].reason).toContain('Unsupported response media type');
      const body = documentOf({
        post: {
          operationId: 'sendThing',
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object' } } } },
        },
      });
      expect(generateMcpTools(body).skipped[0].reason).toContain('Unsupported request media type');
    });

    it('skips header and cookie parameters', () => {
      const doc = documentOf({
        get: { operationId: 'getThing', parameters: [{ name: 'X-Thing', in: 'header', schema: { type: 'string' } }] },
      });
      expect(generateMcpTools(doc).skipped[0].reason).toContain('Unsupported header parameter');
    });

    it('skips binary schemas, negated schemas and cyclic references', () => {
      const binary = documentOf({
        post: {
          operationId: 'setBinary',
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { f: { type: 'string', format: 'binary' } } },
              },
            },
          },
        },
      });
      expect(generateMcpTools(binary).skipped[0].reason).toContain('Binary schemas');
      const negated = documentOf({
        post: {
          operationId: 'setNot',
          requestBody: { content: { 'application/json': { schema: { not: { type: 'string' } } } } },
        },
      });
      expect(generateMcpTools(negated).skipped[0].reason).toContain('Negated schemas');
      const cyclic = documentOf({
        post: {
          operationId: 'setTree',
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Tree' } } } },
        },
      });
      cyclic.components = {
        schemas: { Tree: { type: 'object', properties: { child: { $ref: '#/components/schemas/Tree' } } } },
      };
      expect(generateMcpTools(cyclic).skipped[0].reason).toContain('cyclic');
    });

    it('skips an operation whose body property collides with a parameter', () => {
      const doc = documentOf({
        post: {
          operationId: 'createThing',
          parameters: [{ name: 'name', in: 'query', schema: { type: 'string' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } },
          },
        },
      });
      expect(generateMcpTools(doc).skipped[0].reason).toContain('conflicts with parameter name');
    });

    it('keeps the other tools when one operation cannot be a tool', () => {
      const doc = documentOf({ get: { operationId: 'getThing' }, post: { operationId: 'notificationsLive' } });
      const { tools, skipped } = generateMcpTools(doc);
      expect(tools.map((tool) => tool.name)).toEqual(['getThing']);
      expect(skipped).toHaveLength(1);
    });
  });

  it('ignores OpenAPI extensions and supports structured JSON media types', () => {
    const extended = structuredClone(document);
    const resourcePath = extended.paths?.['/resources/{id}'];
    if (!resourcePath) throw new Error('Test fixture is missing its resource path');
    resourcePath['x-display-name'] = 'Resource';
    resourcePath.patch = {
      operationId: 'updateResource',
      'x-attraccess-auth': AUTH,
      requestBody: {
        required: true,
        content: { 'application/vnd.attraccess+json': { schema: { $ref: '#/components/schemas/UpdateResource' } } },
      },
      responses: { '200': { content: { 'application/vnd.attraccess+json': {} } } },
    };
    expect(generateMcpTools(extended).tools).toHaveLength(2);
  });

  it('preserves map additionalProperties and resolves their schemas', () => {
    const doc = documentOf({
      post: {
        operationId: 'setMap',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: { $ref: '#/components/schemas/MapValue' } },
            },
          },
        },
      },
    });
    doc.components = { schemas: { MapValue: { type: 'array', items: { type: 'string', format: 'binary' } } } };
    expect(generateMcpTools(doc).skipped[0].reason).toContain('Binary schemas are not tool-compatible');
    doc.components = { schemas: { MapValue: { type: 'string' } } };
    expect(generateMcpTools(doc).tools[0].inputSchema.properties.body).toMatchObject({
      additionalProperties: { type: 'string' },
    });
  });

  it('lets operation parameters override shared parameters at matching name and location', () => {
    const doc = documentOf({
      get: {
        operationId: 'getThing',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      },
    });
    const item = doc.paths?.['/things'];
    if (!item) throw new Error('Test fixture is missing its path');
    item.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }];
    expect(generateMcpTools(doc).tools[0].inputSchema.properties.id).toEqual({ type: 'integer' });
  });

  it('translates nullable OpenAPI inputs into null-inclusive JSON Schema', () => {
    const doc = documentOf({
      post: {
        operationId: 'createThing',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } },
        },
      },
    });
    doc.components = {
      schemas: {
        Thing: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            note: { type: 'string', nullable: true },
            kind: { type: 'string', enum: ['a', 'b'], nullable: true },
            owner: { nullable: true, allOf: [{ $ref: '#/components/schemas/Owner' }] },
            tags: { type: 'array', nullable: true, items: { type: 'string' } },
          },
        },
        Owner: { type: 'object', properties: { id: { type: 'number' } } },
      },
    };
    const props = generateMcpTools(doc).tools[0].inputSchema.properties;
    expect(props.note).toEqual({ type: ['string', 'null'] });
    expect(props.kind).toEqual({ type: ['string', 'null'], enum: ['a', 'b', null] });
    expect(props.tags).toEqual({ type: ['array', 'null'], items: { type: 'string' } });
    expect(props.owner).toEqual({ type: ['object', 'null'], properties: { id: { type: 'number' } } });
    expect(JSON.stringify(props)).not.toContain('nullable');
  });

  it('supports typeless, oneOf and allOf request schemas', () => {
    const doc = documentOf({
      post: {
        operationId: 'submitAnswer',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                  extra: { description: 'anything' },
                },
              },
            },
          },
        },
      },
    });
    const props = generateMcpTools(doc).tools[0].inputSchema.properties;
    expect(props.value).toEqual({ oneOf: [{ type: 'string' }, { type: 'number' }] });
    expect(props.extra).toEqual({ description: 'anything' });
  });

  it('keeps the base fields of a schema that extends one allOf branch with its own properties', () => {
    const doc = documentOf({
      post: {
        operationId: 'createThing',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [{ $ref: '#/components/schemas/Base' }],
                properties: { extra: { type: 'string' } },
                required: ['extra'],
              },
            },
          },
        },
      },
    });
    doc.components = {
      schemas: { Base: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
    };
    const [tool] = generateMcpTools(doc).tools;
    expect(tool.bodyProperties.sort()).toEqual(['extra', 'name']);
    expect((tool.inputSchema.required as string[]).sort()).toEqual(['extra', 'name']);
  });

  it('passes an array or primitive body whole as `body`', () => {
    const doc = documentOf({
      put: {
        operationId: 'putBulk',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } },
        },
      },
    });
    const [tool] = generateMcpTools(doc).tools;
    expect(tool.wholeBody).toBe(true);
    expect(tool.inputSchema.required).toEqual(['body']);
  });
});
