import { buildOpenApiDocument } from './artifacts';

describe('OpenAPI error responses', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const responses = (path: string, method = 'get') => (buildOpenApiDocument() as any).paths[path][method].responses;

  it('documents the readiness body for a not-ready 503, not an error envelope', () => {
    expect(responses('/health/ready')['503'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/HealthReadyResponse',
    });
  });

  it('lists release refusals only on versioned routes, and origin, method and internal errors everywhere', () => {
    expect(Object.keys(responses('/health/live'))).toEqual(['200', '403', '404', '405', '500']);
    expect(Object.keys(responses('/v1/capabilities'))).toEqual([
      '200',
      '401',
      '403',
      '404',
      '405',
      '409',
      '426',
      '500',
      '503',
    ]);
    expect(Object.keys(responses('/v1/events'))).toEqual([
      '101',
      '401',
      '403',
      '404',
      '405',
      '409',
      '426',
      '500',
      '503',
    ]);
    expect(responses('/v1/fabric', 'post')).toEqual(
      expect.objectContaining({ '400': expect.anything(), '413': expect.anything(), '501': expect.anything() }),
    );
  });
});

describe('OpenAPI security', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = buildOpenApiDocument() as any;

  it('requires the bearer service token by default and leaves the container probes anonymous', () => {
    expect(document.components.securitySchemes.serviceToken).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(document.security).toEqual([{ serviceToken: [] }]);
    expect(document.paths['/health/live'].get.security).toEqual([]);
    expect(document.paths['/health/ready'].get.security).toEqual([]);
    expect(document.paths['/version'].get.security).toBeUndefined();
    expect(document.paths['/version'].get.responses['401']).toBeDefined();
  });
});
