import { analyzeMcpManifest, generateMcpTools, OpenApiDocument, operationShape } from './openapi-tools';

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
  const manifest = (
    doc: OpenApiDocument = document,
    overrides: Record<string, { decision: 'allow' | 'deny'; reason: string }> = {},
  ) => {
    const result: Record<string, { decision: 'allow' | 'deny'; reason: string; shape: string }> = {};
    for (const [path, item] of Object.entries(doc.paths ?? {}))
      for (const [method, operation] of Object.entries(item)) {
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
    const tools = generateMcpTools(
      document,
      manifest(document, {
        getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
        updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
      }),
    );
    expect(tools.map(({ name }) => name)).toEqual(['getResource', 'updateResource']);
    expect(tools[0].inputSchema.required).toEqual(['id']);
    expect(tools[0].inputSchema.properties).toEqual({ id: { type: 'integer' }, expand: { type: 'boolean' } });
    expect(tools[1].inputSchema.required).toEqual(['name']);
    expect(tools[1].inputSchema.properties.name).toEqual({ type: 'string' });
  });

  it('requires manifest coverage and rejects duplicate operation IDs', () => {
    expect(() =>
      generateMcpTools(document, { getResource: { ...manifest().getResource, decision: 'deny', reason: 'Reviewed.' } }),
    ).toThrow('Unreviewed OpenAPI operation updateResource');
    const duplicate = structuredClone(document);
    duplicate.paths = { ...duplicate.paths, '/other': { get: { operationId: 'getResource' } } };
    expect(() => generateMcpTools(duplicate, {})).toThrow('Duplicate operationId getResource');
  });

  it('requires reasons and rejects incompatible allow decisions', () => {
    expect(() =>
      generateMcpTools(
        document,
        manifest(document, {
          getResource: { decision: 'deny', reason: '' },
          updateResource: { decision: 'deny', reason: 'Reviewed.' },
        }),
      ),
    ).toThrow('has no review reason');
    const incompatible = structuredClone(document);
    incompatible.paths = { ...incompatible.paths, '/firmware/download': { get: { operationId: 'downloadFirmware' } } };
    expect(() =>
      generateMcpTools(
        incompatible,
        manifest(incompatible, {
          getResource: { decision: 'deny', reason: 'Reviewed.' },
          updateResource: { decision: 'deny', reason: 'Reviewed.' },
          downloadFirmware: { decision: 'allow', reason: 'Reviewed.' },
        }),
      ),
    ).toThrow('Incompatible endpoint');
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

    expect(
      generateMcpTools(
        extended,
        manifest(extended, {
          getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
          updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
        }),
      ),
    ).toHaveLength(2);
  });

  it('preserves map additionalProperties and validates operation shape, all success media, streaming and methods', () => {
    const mapDoc: OpenApiDocument = {
      paths: {
        '/maps': {
          post: {
            operationId: 'setMap',
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { type: 'object', additionalProperties: { type: 'string' } } } },
            },
            responses: { '200': { content: { 'application/json': {} } } },
          },
        },
      },
    };
    const mapManifest = manifest(mapDoc, { setMap: { decision: 'allow', reason: 'Reviewed map input.' } });
    expect(generateMcpTools(mapDoc, mapManifest)[0].inputSchema.properties.body).toMatchObject({
      additionalProperties: { type: 'string' },
    });
    const changed = structuredClone(mapDoc);
    const changedOperation = changed.paths?.['/maps']?.post;
    if (!changedOperation || typeof changedOperation !== 'object')
      throw new Error('Test fixture is missing its operation');
    changedOperation.summary = 'Changed contract';
    expect(() => generateMcpTools(changed, mapManifest)).toThrow('shape drift');
    const unsafe = structuredClone(mapDoc);
    const unsafeOperation = unsafe.paths?.['/maps']?.post;
    if (!unsafeOperation || typeof unsafeOperation !== 'object')
      throw new Error('Test fixture is missing its operation');
    unsafeOperation.responses = { ...unsafeOperation.responses, '201': { content: { 'text/event-stream': {} } } };
    expect(() =>
      generateMcpTools(unsafe, manifest(unsafe, { setMap: { decision: 'allow', reason: 'Reviewed.' } })),
    ).toThrow('Unsupported response media type');
    const stream = structuredClone(mapDoc);
    const streamOperation = stream.paths?.['/maps']?.post;
    if (!streamOperation || typeof streamOperation !== 'object')
      throw new Error('Test fixture is missing its operation');
    streamOperation['x-mcp-streaming'] = true;
    expect(() =>
      generateMcpTools(stream, manifest(stream, { setMap: { decision: 'allow', reason: 'Reviewed.' } })),
    ).toThrow('Incompatible endpoint');
    const unsupported: OpenApiDocument = { paths: { '/maps': { options: { operationId: 'optionsMaps' } } } };
    expect(() => generateMcpTools(unsupported, {})).toThrow('Unsupported OpenAPI operation OPTIONS');
  });

  it('resolves and rejects incompatible additionalProperties schemas', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/maps': {
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
            responses: { '200': {} },
          },
        },
      },
      components: { schemas: { MapValue: { type: 'array', items: { type: 'string', format: 'binary' } } } },
    };
    const reviewed = manifest(doc, { setMap: { decision: 'allow', reason: 'Reviewed map schema.' } });
    expect(() => generateMcpTools(doc, reviewed)).toThrow('Binary schemas are not tool-compatible');
    const valid = structuredClone(doc);
    const schemas = valid.components?.schemas;
    if (!schemas) throw new Error('Test fixture is missing schemas');
    schemas.MapValue = { type: 'string' };
    const validManifest = manifest(valid, { setMap: { decision: 'allow', reason: 'Reviewed map schema.' } });
    expect(generateMcpTools(valid, validManifest)[0].inputSchema.properties.body).toMatchObject({
      additionalProperties: { type: 'string' },
    });
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
    expect(() =>
      generateMcpTools(
        doc,
        manifest(doc, {
          notificationsLive: { decision: 'allow', reason: 'A bad review must not make streaming tool safe.' },
        }),
      ),
    ).toThrow('Incompatible endpoint');
  });

  it.each([
    ['getLogo', '/logo.png'],
    ['getFrontendPluginFile', '/plugins/{name}/frontend/{file}'],
  ])('rejects known binary or streamed operation %s even if its manifest says allow', (operationId, path) => {
    const doc: OpenApiDocument = {
      paths: {
        [path]: {
          get: {
            operationId,
            responses: { '200': { content: { 'application/json': { schema: { type: 'string' } } } } },
          },
        },
      },
    };
    const reviewed = manifest(doc, {
      [operationId]: { decision: 'allow', reason: 'Deliberately unsafe regression fixture.' },
    });
    expect(() => generateMcpTools(doc, reviewed)).toThrow(
      `Incompatible endpoint GET ${path} cannot be allowed (${operationId})`,
    );
  });

  it('lets operation parameters override shared parameters at matching name and location', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/things/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          get: {
            operationId: 'getThing',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { '200': { content: { 'application/json': {} } } },
          },
        },
      },
    };
    expect(
      generateMcpTools(doc, manifest(doc, { getThing: { decision: 'allow', reason: 'Reviewed.' } }))[0].inputSchema
        .properties.id,
    ).toEqual({ type: 'integer' });

    const changedSharedParameter = structuredClone(doc);
    const shared = changedSharedParameter.paths?.['/things/{id}']?.parameters;
    if (!Array.isArray(shared)) throw new Error('Test fixture is missing its shared path parameter');
    shared[0] = { name: 'id', in: 'path', required: true, schema: { type: 'number' } };
    expect(() =>
      generateMcpTools(changedSharedParameter, manifest(doc, { getThing: { decision: 'allow', reason: 'Reviewed.' } })),
    ).toThrow('shape drift');
  });

  it('translates nullable OpenAPI inputs into null-inclusive JSON Schema', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/things': {
          post: {
            operationId: 'createThing',
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } },
            },
            responses: { '201': { content: { 'application/json': {} } } },
          },
        },
      },
      components: {
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
      },
    };
    const props = generateMcpTools(doc, manifest(doc, { createThing: { decision: 'allow', reason: 'Reviewed.' } }))[0]
      .inputSchema.properties;
    expect(props.note).toEqual({ type: ['string', 'null'] });
    expect(props.kind).toEqual({ type: ['string', 'null'], enum: ['a', 'b', null] });
    expect(props.tags).toEqual({ type: ['array', 'null'], items: { type: 'string' } });
    expect(props.owner).toEqual({ type: ['object', 'null'], properties: { id: { type: 'number' } } });
    expect(JSON.stringify(props)).not.toContain('nullable');
  });

  it('supports typeless, oneOf and allOf request schemas', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/answers': {
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
            responses: { '200': {} },
          },
        },
      },
    };
    const props = generateMcpTools(doc, manifest(doc, { submitAnswer: { decision: 'allow', reason: 'Reviewed.' } }))[0]
      .inputSchema.properties;
    expect(props.value).toEqual({ oneOf: [{ type: 'string' }, { type: 'number' }] });
    expect(props.extra).toEqual({ description: 'anything' });
  });

  it('keeps the base fields of a schema that extends one allOf branch with its own properties', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/things': {
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
            responses: { '200': {} },
          },
        },
      },
      components: {
        schemas: { Base: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
      },
    };
    const [tool] = generateMcpTools(doc, manifest(doc, { createThing: { decision: 'allow', reason: 'Reviewed.' } }));
    expect(tool.bodyProperties.sort()).toEqual(['extra', 'name']);
    expect((tool.inputSchema.required as string[]).sort()).toEqual(['extra', 'name']);
  });

  it('passes an array or primitive body whole as `body`', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/bulk': {
          put: {
            operationId: 'putBulk',
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } },
            },
            responses: { '200': {} },
          },
        },
      },
    };
    const [tool] = generateMcpTools(doc, manifest(doc, { putBulk: { decision: 'allow', reason: 'Reviewed.' } }));
    expect(tool.wholeBody).toBe(true);
    expect(tool.inputSchema.required).toEqual(['body']);
  });

  it('hashes only the schemas an operation can reach', () => {
    const shape = (unrelated: string) =>
      operationShape('GET', '/x', document.paths?.['/resources/{id}']?.patch as never, [], {
        ...document.components?.schemas,
        Unrelated: { type: 'string', description: unrelated },
      });
    expect(shape('one')).toBe(shape('two'));
    const changedReachable = operationShape(
      'PATCH',
      '/resources/{id}',
      document.paths?.['/resources/{id}']?.patch as never,
      [],
      {
        UpdateResource: { type: 'object', properties: { name: { type: 'number' } } },
      },
    );
    expect(changedReachable).not.toBe(
      operationShape(
        'PATCH',
        '/resources/{id}',
        document.paths?.['/resources/{id}']?.patch as never,
        [],
        document.components?.schemas,
      ),
    );
  });

  describe('analyzeMcpManifest', () => {
    it('reports every kind of drift with the exact fix, without throwing', () => {
      const doc: OpenApiDocument = structuredClone(document);
      const reviewed = manifest(doc, {
        getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
        updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
      });
      reviewed.removedOperation = { decision: 'deny', reason: 'Was removed from the API.', shape: '00000000' };
      doc.paths = {
        ...doc.paths,
        '/new': { get: { operationId: 'newOperation', responses: { '200': {} } } },
        '/dup': { get: { operationId: 'getResource', responses: { '200': {} } } },
        '/noid': { get: { responses: { '200': {} } } },
        '/live/events': { get: { operationId: 'liveEvents', responses: { '200': {} } } },
      };
      reviewed.liveEvents = {
        decision: 'allow',
        reason: 'A bad review must not make a stream a tool.',
        shape: operationShape('GET', '/live/events', { operationId: 'liveEvents', responses: { '200': {} } }),
      };
      const drifted = structuredClone(doc);
      const resource = drifted.paths?.['/resources/{id}']?.get as { summary?: string };
      resource.summary = 'Changed';

      const kinds = (d: OpenApiDocument) =>
        analyzeMcpManifest(d, reviewed)
          .problems.map((problem) => problem.kind)
          .sort();
      expect(kinds(doc)).toEqual(
        ['duplicate-operation-id', 'incompatible', 'missing-operation-id', 'shape-drift', 'stale', 'unreviewed'].sort(),
      );
      const unreviewed = analyzeMcpManifest(doc, reviewed).problems.find((problem) => problem.kind === 'unreviewed');
      expect(unreviewed?.detail).toContain('"newOperation"');
      expect(unreviewed?.detail).toContain(unreviewed?.shape as string);
      const stale = analyzeMcpManifest(doc, reviewed).problems.find((problem) => problem.kind === 'stale');
      expect(stale?.detail).toContain('remove "removedOperation"');
    });

    it('reports a changed shape alone, naming the entry and its new shape', () => {
      const reviewed = manifest(document, {
        getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
        updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
      });
      expect(analyzeMcpManifest(document, reviewed).problems).toEqual([]);
      const drifted: OpenApiDocument = structuredClone(document);
      (drifted.paths?.['/resources/{id}']?.get as { summary?: string }).summary = 'Changed';
      const problems = analyzeMcpManifest(drifted, reviewed).problems;
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({ kind: 'shape-drift', operationId: 'getResource' });
      expect(problems[0].detail).toContain(`set its "shape" to "${problems[0].shape}"`);
    });

    it('reports an allowed operation that stops being tool-compatible once its new shape is pinned', () => {
      const reviewed = manifest(document, {
        getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
        updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
      });
      const binary: OpenApiDocument = structuredClone(document);
      const operation = binary.paths?.['/resources/{id}']?.get as { responses: Record<string, unknown> };
      operation.responses = { '200': { content: { 'application/octet-stream': {} } } };
      const drift = analyzeMcpManifest(binary, reviewed).problems;
      expect(drift.map((problem) => problem.kind)).toEqual(['shape-drift']);
      // MCP_MANIFEST_WRITE=1 re-pins shapes but keeps decisions: the allow must still be refused.
      reviewed.getResource.shape = drift[0].shape as string;
      const after = analyzeMcpManifest(binary, reviewed);
      expect(after.problems).toEqual([expect.objectContaining({ kind: 'incompatible', operationId: 'getResource' })]);
      expect(after.problems[0].detail).toContain('Change its manifest decision to "deny"');
      expect(after.tools.map((tool) => tool.name)).not.toContain('getResource');
    });

    it('still lists the individually valid tools next to a problem so a running server can skip the rest', () => {
      const reviewed = manifest(document, {
        getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
        updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
      });
      const extra: OpenApiDocument = {
        ...document,
        paths: { ...document.paths, '/plugin': { get: { operationId: 'pluginOnly', responses: { '200': {} } } } },
      };
      const { tools, problems } = analyzeMcpManifest(extra, reviewed);
      expect(tools.map((tool) => tool.name)).toEqual(['getResource', 'updateResource']);
      expect(problems.map((problem) => problem.operationId)).toEqual(['pluginOnly']);
    });

    it('does not let a colliding plugin operationId hide or replace the reviewed host operation', () => {
      const reviewed = manifest(document, { getResource: { decision: 'allow', reason: 'Read-only resource lookup.' } });
      const colliding: OpenApiDocument = {
        ...document,
        paths: {
          ...document.paths,
          '/plugins/x/resources': { get: { operationId: 'getResource', responses: { '200': {} } } },
        },
      };
      const { tools } = analyzeMcpManifest(colliding, reviewed);
      expect(tools.map((tool) => [tool.name, tool.path])).toEqual([['getResource', '/resources/{id}']]);
    });

    it('rejects operation ids longer than the MCP tool-name limit', () => {
      const id = `a${'b'.repeat(70)}`;
      const doc: OpenApiDocument = { paths: { '/x': { get: { operationId: id, responses: { '200': {} } } } } };
      expect(analyzeMcpManifest(doc, {}).problems[0].kind).toBe('missing-operation-id');
    });
  });
});
