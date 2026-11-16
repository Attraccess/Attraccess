import { buildRestRequest, formatRestResponse, McpArgumentError } from './mcp-rest-bridge';
import type { McpTool } from './openapi-tools';

const tool = (overrides: Partial<McpTool> = {}): McpTool => ({
  name: 'updateThing',
  description: 'Update',
  method: 'PATCH',
  path: '/api/things/{id}/parts/{part}',
  pathParameters: ['id', 'part'],
  queryParameters: ['tags', 'dry'],
  bodyProperties: ['name', 'note'],
  wholeBody: false,
  inputSchema: {
    type: 'object',
    properties: { id: {}, part: {}, tags: {}, dry: {}, name: {}, note: {} },
    required: ['id', 'part'],
    additionalProperties: false,
  },
  ...overrides,
});

describe('buildRestRequest', () => {
  it('substitutes encoded path parameters, repeats array queries and keeps body properties together', () => {
    expect(
      buildRestRequest(tool(), { id: 7, part: 'a/b c', tags: ['x', 'y'], dry: false, name: 'N', note: null }),
    ).toEqual({
      method: 'PATCH',
      url: '/api/things/7/parts/a%2Fb%20c?tags=x&tags=y&dry=false',
      body: { name: 'N', note: null },
    });
  });

  it('sends no body for operations without one and skips unset queries', () => {
    expect(buildRestRequest(tool({ method: 'GET', bodyProperties: [] }), { id: 1, part: 2 })).toEqual({
      method: 'GET',
      url: '/api/things/1/parts/2',
      body: undefined,
    });
  });

  it('passes a whole array body as `body`', () => {
    const bulk = tool({
      path: '/api/bulk',
      pathParameters: [],
      queryParameters: [],
      bodyProperties: ['body'],
      wholeBody: true,
      inputSchema: { type: 'object', properties: { body: {} }, required: ['body'], additionalProperties: false },
    });
    expect(buildRestRequest(bulk, { body: ['a', 'b'] }).body).toEqual(['a', 'b']);
  });

  it('rejects unknown arguments and missing path parameters as argument errors', () => {
    expect(() => buildRestRequest(tool(), { id: 1, part: 2, nope: 1 })).toThrow(McpArgumentError);
    expect(() => buildRestRequest(tool(), { id: 1 })).toThrow('Path parameter "part" is required');
    expect(() => buildRestRequest(tool(), { id: { a: 1 }, part: 2 })).toThrow(McpArgumentError);
  });
});

describe('formatRestResponse', () => {
  const json = 'application/json; charset=utf-8';

  it('returns JSON bodies as text', () => {
    expect(formatRestResponse(200, json, '{"a":1}')).toEqual({ content: [{ type: 'text', text: '{"a":1}' }] });
  });

  it.each([204, 205])('handles body-less status %i', (status) => {
    const result = formatRestResponse(status, undefined, '');
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: `HTTP ${status}: success, no response body` }]);
  });

  it('reports a 304 as an error result without a body', () => {
    const result = formatRestResponse(304, undefined, '');
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'HTTP 304' }]);
  });

  it('turns REST errors into tool errors with status and message', () => {
    expect(formatRestResponse(403, json, '{"message":"Insufficient permissions","statusCode":403}')).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'HTTP 403 Forbidden: Insufficient permissions' }],
    });
    expect(formatRestResponse(400, json, '{"message":["name must be a string","x must exist"]}').content).toEqual([
      { type: 'text', text: 'HTTP 400 Bad Request: name must be a string; x must exist' },
    ]);
    expect(formatRestResponse(502, 'text/plain', 'bad gateway').content).toEqual([
      { type: 'text', text: 'HTTP 502: bad gateway' },
    ]);
  });

  it('refuses binary responses instead of returning them', () => {
    const result = formatRestResponse(200, 'image/png', 'PNG...');
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('image/png');
  });

  it('truncates very large responses', () => {
    const text = (formatRestResponse(200, json, 'x'.repeat(1_200_000)).content[0] as { text: string }).text;
    expect(text.length).toBeLessThan(1_000_200);
    expect(text).toContain('[truncated');
  });
});
