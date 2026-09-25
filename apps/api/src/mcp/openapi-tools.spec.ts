import { generateMcpTools, OpenApiDocument } from './openapi-tools';

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
        },
        patch: {
          operationId: 'updateResource',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateResource' } } },
          },
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

  it('uses operation IDs and combines path, query, and body inputs', () => {
    const tools = generateMcpTools(document, {
      getResource: { decision: 'allow', reason: 'Read-only resource lookup.' },
      updateResource: { decision: 'allow', reason: 'Resource updates use normal REST authorization.' },
    });
    expect(tools.map(({ name }) => name)).toEqual(['getResource', 'updateResource']);
    expect(tools[0].inputSchema.required).toEqual(['id']);
    expect(tools[0].inputSchema.properties).toEqual({ id: { type: 'integer' }, expand: { type: 'boolean' } });
    expect(tools[1].inputSchema.required).toEqual(['name']);
    expect(tools[1].inputSchema.properties.name).toEqual({ type: 'string' });
  });

  it('requires manifest coverage and rejects duplicate operation IDs', () => {
    expect(() => generateMcpTools(document, { getResource: { decision: 'deny', reason: 'Reviewed.' } })).toThrow(
      'Unreviewed OpenAPI operation updateResource',
    );
    const duplicate = structuredClone(document);
    duplicate.paths = { ...duplicate.paths, '/other': { get: { operationId: 'getResource' } } };
    expect(() => generateMcpTools(duplicate, {})).toThrow('Duplicate operationId getResource');
  });

  it('requires reasons and rejects incompatible allow decisions', () => {
    expect(() => generateMcpTools(document, {
      getResource: { decision: 'deny', reason: '' },
      updateResource: { decision: 'deny', reason: 'Reviewed.' },
    })).toThrow('has no review reason');
    const incompatible = structuredClone(document);
    incompatible.paths = { ...incompatible.paths, '/firmware/download': { get: { operationId: 'downloadFirmware' } } };
    expect(() => generateMcpTools(incompatible, {
      getResource: { decision: 'deny', reason: 'Reviewed.' },
      updateResource: { decision: 'deny', reason: 'Reviewed.' },
      downloadFirmware: { decision: 'allow', reason: 'Reviewed.' },
    })).toThrow('Incompatible endpoint');
  });
});
