import { generateMcpTools, OpenApiDocument, operationShape } from './openapi-tools';

describe('generateMcpTools', () => {
  const document: OpenApiDocument = {
    paths: {
      '/resources/{id}': {
        get: {
          operationId: 'getResource',
          summary: 'Get a resource',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'expand', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: { '200': { content: { 'application/json': {} } } },
        },
        patch: {
          operationId: 'updateResource',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateResource' } } },
          },
          responses: { '200': { content: { 'application/json': {} } } },
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
  const manifest = (doc: OpenApiDocument = document, overrides: Record<string, { decision: 'allow' | 'deny'; reason: string }> = {}) => {
    const result: Record<string, { decision: 'allow' | 'deny'; reason: string; shape: string }> = {};
    for (const [path, item] of Object.entries(doc.paths ?? {})) for (const [method, operation] of Object.entries(item)) {
      if (!operation || typeof operation !== 'object' || !('operationId' in operation)) continue;
      const id = operation.operationId as string;
      const choice = overrides[id] ?? { decision: 'deny' as const, reason: 'Reviewed fixture operation.' };
      result[id] = {
        ...choice,
        shape: operationShape(method, path, operation, item.parameters ?? [], doc.components?.schemas ?? {}),
      };
    }
    return result;
  };

  it('uses operation IDs and combines path, query, and body inputs', () => {
    const tools = generateMcpTools(document, manifest(document, {
      getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
      updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
    }));
    expect(tools.map(({ name }) => name)).toEqual(['getResource', 'updateResource']);
    expect(tools[0].inputSchema.required).toEqual(['id']);
    expect(tools[0].inputSchema.properties).toEqual({ id: { type: 'integer' }, expand: { type: 'boolean' } });
    expect(tools[1].inputSchema.required).toEqual(['name']);
    expect(tools[1].inputSchema.properties.name).toEqual({ type: 'string' });
  });

  it('requires manifest coverage and rejects duplicate operation IDs', () => {
    expect(() => generateMcpTools(document, { getResource: { ...manifest().getResource, decision: 'deny', reason: 'Reviewed.' } })).toThrow(
      'Unreviewed OpenAPI operation updateResource',
    );
    const duplicate = structuredClone(document);
    duplicate.paths = { ...duplicate.paths, '/other': { get: { operationId: 'getResource' } } };
    expect(() => generateMcpTools(duplicate, {})).toThrow('Duplicate operationId getResource');
  });

  it('requires reasons and rejects incompatible allow decisions', () => {
    expect(() => generateMcpTools(document, manifest(document, {
      getResource: { decision: 'deny', reason: '' },
      updateResource: { decision: 'deny', reason: 'Reviewed.' },
    }))).toThrow('has no review reason');
    const incompatible = structuredClone(document);
    incompatible.paths = { ...incompatible.paths, '/firmware/download': { get: { operationId: 'downloadFirmware' } } };
    expect(() => generateMcpTools(incompatible, manifest(incompatible, {
      getResource: { decision: 'deny', reason: 'Reviewed.' },
      updateResource: { decision: 'deny', reason: 'Reviewed.' },
      downloadFirmware: { decision: 'allow', reason: 'Reviewed.' },
    }))).toThrow('Incompatible endpoint');
  });

  it('ignores OpenAPI extensions and supports structured JSON media types', () => {
    const extended = structuredClone(document);
    const resourcePath = extended.paths?.['/resources/{id}'];
    if (!resourcePath) throw new Error('Test fixture is missing its resource path');
    resourcePath['x-display-name'] = 'Resource';
    resourcePath.patch = {
      operationId: 'updateResource',
      requestBody: {
        required: true,
        content: { 'application/vnd.attraccess+json': { schema: { $ref: '#/components/schemas/UpdateResource' } } },
      },
      responses: { '200': { content: { 'application/vnd.attraccess+json': {} } } },
    };

    expect(generateMcpTools(extended, manifest(extended, {
      getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
      updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
    }))).toHaveLength(2);
  });

  it('preserves map additionalProperties and validates operation shape, all success media, streaming and methods', () => {
    const mapDoc: OpenApiDocument = { paths: { '/maps': { post: { operationId: 'setMap', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: { type: 'string' } } } } }, responses: { '200': { content: { 'application/json': {} } } } } } } };
    const mapManifest = manifest(mapDoc, { setMap: { decision: 'allow', reason: 'Reviewed map input.' } });
    expect(generateMcpTools(mapDoc, mapManifest)[0].inputSchema.properties.body).toMatchObject({ additionalProperties: { type: 'string' } });
    const changed = structuredClone(mapDoc);
    const changedOperation = changed.paths?.['/maps']?.post;
    if (!changedOperation || typeof changedOperation !== 'object') throw new Error('Test fixture is missing its operation');
    changedOperation.summary = 'Changed contract';
    expect(() => generateMcpTools(changed, mapManifest)).toThrow('shape drift');
    const unsafe = structuredClone(mapDoc);
    const unsafeOperation = unsafe.paths?.['/maps']?.post;
    if (!unsafeOperation || typeof unsafeOperation !== 'object') throw new Error('Test fixture is missing its operation');
    unsafeOperation.responses = { ...unsafeOperation.responses, '201': { content: { 'text/event-stream': {} } } };
    expect(() => generateMcpTools(unsafe, manifest(unsafe, { setMap: { decision: 'allow', reason: 'Reviewed.' } }))).toThrow('Unsupported response media type');
    const stream = structuredClone(mapDoc);
    const streamOperation = stream.paths?.['/maps']?.post;
    if (!streamOperation || typeof streamOperation !== 'object') throw new Error('Test fixture is missing its operation');
    streamOperation['x-mcp-streaming'] = true;
    expect(() => generateMcpTools(stream, manifest(stream, { setMap: { decision: 'allow', reason: 'Reviewed.' } }))).toThrow('Incompatible endpoint');
    const unsupported: OpenApiDocument = { paths: { '/maps': { options: { operationId: 'optionsMaps' } } } };
    expect(() => generateMcpTools(unsupported, {})).toThrow('Unsupported OpenAPI operation OPTIONS');
  });

  it('rejects streaming operation IDs even when the path and response do not declare streaming', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/notifications': {
          get: {
            operationId: 'notificationsLive',
            responses: { '200': {} },
          },
        },
      },
    };
    expect(() => generateMcpTools(doc, manifest(doc, {
      notificationsLive: { decision: 'allow', reason: 'A bad review must not make streaming tool safe.' },
    }))).toThrow('Incompatible endpoint');
  });

  it('lets operation parameters override shared parameters at matching name and location', () => {
    const doc: OpenApiDocument = { paths: { '/things/{id}': { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], get: { operationId: 'getThing', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { content: { 'application/json': {} } } } } } } };
    expect(generateMcpTools(doc, manifest(doc, { getThing: { decision: 'allow', reason: 'Reviewed.' } }))[0].inputSchema.properties.id).toEqual({ type: 'integer' });

    const changedSharedParameter = structuredClone(doc);
    const shared = changedSharedParameter.paths?.['/things/{id}']?.parameters;
    if (!Array.isArray(shared)) throw new Error('Test fixture is missing its shared path parameter');
    shared[0] = { name: 'id', in: 'path', required: true, schema: { type: 'number' } };
    expect(() => generateMcpTools(changedSharedParameter, manifest(doc, { getThing: { decision: 'allow', reason: 'Reviewed.' } }))).toThrow('shape drift');
  });
});
