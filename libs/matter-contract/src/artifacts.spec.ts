import { buildOpenApiDocument } from './artifacts';

describe('OpenAPI error responses', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const responses = (path: string, method = 'get') => (buildOpenApiDocument() as any).paths[path][method].responses;

  it('documents the readiness body for a not-ready 503, not an error envelope', () => {
    expect(responses('/health/ready')['503'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/HealthReadyResponse',
    });
  });

  it('lists release refusals only on versioned routes, and origin and internal errors everywhere', () => {
    expect(Object.keys(responses('/health/live'))).toEqual(['200', '403', '404', '500']);
    expect(Object.keys(responses('/v1/capabilities'))).toEqual(['200', '403', '404', '409', '426', '500', '503']);
    expect(Object.keys(responses('/v1/events'))).toEqual(['101', '403', '404', '409', '426', '500', '503']);
    expect(responses('/v1/fabric', 'post')).toEqual(
      expect.objectContaining({ '400': expect.anything(), '413': expect.anything(), '501': expect.anything() }),
    );
  });
});
