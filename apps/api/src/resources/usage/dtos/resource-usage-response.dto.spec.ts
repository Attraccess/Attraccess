import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ResourceUsageController } from '../sessions/resource-usage.controller';
import { SupervisionController } from '../../supervision/supervision.controller';

/** The API description of a usage session is a published contract: schema names and shapes stay as they were. */
describe('ResourceUsage API description', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ResourceUsageController, SupervisionController] })
      .useMocker(() => ({}))
      .compile();
    const app = module.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('usage').build());
    await app.close();
  });

  const schema = (name: string) => document.components?.schemas?.[name] as Record<string, unknown>;
  const responseRef = (path: string, method: 'get' | 'post' | 'put', status: string) => {
    const operation = document.paths[path][method] as unknown as {
      responses: Record<string, { content: { 'application/json': { schema: unknown } } }>;
    };
    return operation.responses[status].content['application/json'].schema;
  };

  it('publishes the schema under the name ResourceUsage with the fields of the usage session', () => {
    const usage = schema('ResourceUsage') as { properties: Record<string, unknown>; required: string[] };

    expect(Object.keys(usage.properties)).toEqual([
      'sessionDurationCreditsPerMinute',
      'operatingDurationCreditsPerMinute',
      'creditsPerUsage',
      'billingFactor',
      'meterRates',
      'attributedOperatingDurationInMinutes',
      'autoEndAt',
      'maxAutoEndAt',
      'estimatedDurationMinutes',
      'id',
      'usageAction',
      'resourceId',
      'userId',
      'startTime',
      'startNotes',
      'endTime',
      'endNotes',
      'resource',
      'user',
      'usageInMinutes',
      'projectId',
      'project',
      'formSubmissions',
      'isFinalized',
      'supervisorUserId',
      'supervisorUser',
    ]);
    expect(usage.required).toEqual([
      'id',
      'usageAction',
      'resourceId',
      'startTime',
      'usageInMinutes',
      'formSubmissions',
      'isFinalized',
    ]);
    // Internal lifecycle state and the bill never leave the API.
    expect(usage.properties).not.toHaveProperty('lifecyclePending');
    expect(usage.properties).not.toHaveProperty('billingTransaction');
  });

  it('describes types, nullability and the related schemas as before', () => {
    const { properties } = schema('ResourceUsage') as { properties: Record<string, Record<string, unknown>> };

    expect(properties.creditsPerUsage).toMatchObject({ type: 'number', nullable: true });
    expect(properties.startTime).toMatchObject({ type: 'string', format: 'date-time' });
    expect(properties.endTime).toMatchObject({ type: 'string', format: 'date-time' });
    expect(properties.usageAction).toMatchObject({ allOf: [{ $ref: '#/components/schemas/ResourceUsageAction' }] });
    expect(properties.resource).toMatchObject({ allOf: [{ $ref: '#/components/schemas/Resource' }] });
    expect(properties.user).toMatchObject({ allOf: [{ $ref: '#/components/schemas/User' }] });
    expect(properties.supervisorUser).toMatchObject({ allOf: [{ $ref: '#/components/schemas/User' }] });
    expect(properties.project).toMatchObject({ allOf: [{ $ref: '#/components/schemas/Project' }] });
    expect(properties.formSubmissions).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/FormSubmission' },
    });
  });

  it('is what the usage and supervision endpoints respond with', () => {
    const usage = { $ref: '#/components/schemas/ResourceUsage' };

    expect(responseRef('/resources/{resourceId}/usage/start', 'post', '201')).toEqual(usage);
    expect(responseRef('/resources/{resourceId}/usage/lock', 'post', '200')).toEqual(usage);
    expect(responseRef('/resources/{resourceId}/usage/{usageId}', 'get', '200')).toEqual(usage);
    expect(responseRef('/resources/{resourceId}/usage/supervision/request', 'post', '201')).toEqual(usage);
    expect(responseRef('/resources/supervision/requests/{requestId}/approve', 'post', '201')).toEqual(usage);
  });

  it('answers an end with the same usage session plus what became of its maintenance request', () => {
    type Described = { properties: Record<string, unknown>; required: string[] };
    const usage = schema('ResourceUsage') as unknown as Described;
    const ended = schema('EndedResourceUsage') as unknown as Described;

    expect(responseRef('/resources/{resourceId}/usage/end', 'put', '200')).toEqual({
      $ref: '#/components/schemas/EndedResourceUsage',
    });
    // Only an addition: whoever reads the response as a ResourceUsage still gets every field it describes.
    const { maintenanceRequestFiled, ...sessionFields } = ended.properties;
    expect(maintenanceRequestFiled).toMatchObject({ type: 'boolean' });
    expect(sessionFields).toEqual(usage.properties);
    expect(ended.required).toEqual(usage.required);
  });

  it('keeps the history and active-session responses', () => {
    const history = schema('GetResourceHistoryResponseDto') as { properties: Record<string, unknown> };
    const active = schema('GetActiveUsageSessionDto') as { properties: Record<string, unknown>; required: string[] };

    expect(history.properties.data).toEqual({ type: 'array', items: { $ref: '#/components/schemas/ResourceUsage' } });
    expect(active.properties.usage).toMatchObject({
      nullable: true,
      allOf: [{ $ref: '#/components/schemas/ResourceUsage' }],
    });
    expect(active.properties.usages).toEqual(
      expect.objectContaining({ type: 'array', items: { $ref: '#/components/schemas/ResourceUsage' } }),
    );
    expect(active.required).toEqual(['usage', 'usages', 'activeSessionCount', 'maxParallelSessions', 'isFull']);
  });
});
