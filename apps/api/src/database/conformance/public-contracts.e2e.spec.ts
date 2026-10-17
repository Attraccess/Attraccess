import { SchemaObjectFactory } from '@nestjs/swagger/dist/services/schema-object-factory';
import { ModelPropertiesAccessor } from '@nestjs/swagger/dist/services/model-properties-accessor';
import { SwaggerTypesMapper } from '@nestjs/swagger/dist/services/swagger-types-mapper';
import { Test } from '@nestjs/testing';
import { INestApplication, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { instanceToPlain } from 'class-transformer';
import request from 'supertest';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk/v2';
import { BillingController } from '../../billing/billing.controller';
import { BillingService } from '../../billing/charges/billing.service';
import { SumUpService } from '../../billing/sumup/sumup.service';
import { LiveNotificationsService } from '../../billing/live-notifications/live-notifications.service';
import { ResourceFlowsService } from '../../resources/flows/resource-flows.service';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';
import { LicenseGuard } from '../../license/license.guard';
import { createSqliteApplicationFixture } from './sqlite-fixture';
import { ApplicationFixture, ApplicationClient } from './backend-fixture';
import { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import { mapResponse } from '../../transport/response-mapper';
import * as responses from '../../transport/models';

/** Actual HTTP controller/serializer with real migrated ledger state. Authentication/license are simulated here. */
describe('persistence replacement: public billing HTTP boundary', () => {
  let fixture: ApplicationFixture;
  let client: ApplicationClient;
  let app: INestApplication;
  beforeEach(async () => {
    fixture = await createSqliteApplicationFixture();
    client = await fixture.client();
    const billing = {
      getBalance: async () => (await client.snapshot()).balances[0],
      getTransaction: async (id) => ({
        ...(await client.snapshot()).ledger.find((row) => row.id === id),
        internalDriver: 'private',
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: billing },
        ...[SumUpService, LiveNotificationsService, ResourceFlowsService, SseInstrumentation].map((provide) => ({
          provide,
          useValue: {},
        })),
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = { id: 1, effectivePermissions: new Set(['billing.manage']) };
          return true;
        },
      })
      .overrideGuard(LicenseGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    await fixture?.close();
  });
  it('preserves balance and transaction JSON after manual credit and refund', async () => {
    const credit = await client.manual(123456789);
    const refund = await client.refund(credit.id, 17);
    await request(app.getHttpServer()).get('/users/1/billing/balance').expect(200, { value: 123456872 });
    const response = await request(app.getHttpServer()).get(`/users/1/billing/transactions/${refund.id}`).expect(200);
    expect(response.body).toMatchObject({
      id: refund.id,
      userId: 1,
      amount: -17,
      status: 'completed',
      refundOfId: credit.id,
    });
    expect(response.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(response.body).not.toHaveProperty('internalDriver');
  });
});

describe('persistence replacement: public response and device/flow records', () => {
  it('exports circular user, authentication and role relations as objects for generated clients', () => {
    const schemas = {};
    new SchemaObjectFactory(new ModelPropertiesAccessor(), new SwaggerTypesMapper()).exploreModelSchema(
      responses.User,
      schemas,
    );
    expect(Reflect.get(schemas, 'User').properties.userRoles).toEqual({
      description: 'Role assignments for this user',
      type: 'array',
      items: { $ref: '#/components/schemas/UserRole' },
    });
    expect(Reflect.get(schemas, 'User').properties.authenticationDetails.items).toEqual({
      $ref: '#/components/schemas/AuthenticationDetail',
    });
    expect(Reflect.get(schemas, 'Role').properties.rolePermissions.items).toEqual({
      $ref: '#/components/schemas/RolePermission',
    });
  });
  it.each([
    [
      'User',
      {
        id: 1,
        username: 'operator',
        passwordResetToken: 'secret',
        authenticationDetails: [{ id: 2, type: 'local_password', password: 'hash' }],
      },
      { id: 1, username: 'operator', authenticationDetails: [{ id: 2, type: 'local_password' }] },
    ],
    [
      'SSOProvider',
      { id: 1, name: 'SSO', oidcConfiguration: { id: 2, clientId: 'public', clientSecret: 'secret' } },
      { id: 1, name: 'SSO', oidcConfiguration: { id: 2, clientId: 'public' } },
    ],
    [
      'ResourceUsage',
      {
        id: 7,
        supervisorUserId: null,
        meterRates: [{ meterId: 8, name: 'energy', creditsPerUnit: 123 }],
        endTime: null,
      },
      {
        id: 7,
        supervisorUserId: null,
        meterRates: [{ meterId: 8, name: 'energy', creditsPerUnit: 123 }],
        endTime: null,
      },
    ],
    [
      'Message',
      { id: 3, content: 'hello', sender: { id: 1, username: 'operator', passwordResetToken: 'secret' } },
      { id: 3, content: 'hello', sender: { id: 1, username: 'operator' } },
    ],
  ])('retains %s projection and privacy', (name, input, expected) => {
    const projected = mapResponse(Reflect.get(responses, name), { ...input, internalDriver: 'private' });
    expect(JSON.parse(JSON.stringify(instanceToPlain(projected)))).toEqual(expected);
  });
  it('retains plugin/device flow payload form keys, exact credits, dates and safe user fields', () => {
    const service = Object.create(ResourceUsageService.prototype);
    const payload = service.getResourceUsageFlowPayload(
      {
        id: 7,
        resourceId: 1,
        userId: 2,
        startTime: new Date('2026-01-01T00:00:00Z'),
        endTime: null,
        creditsPerUsage: 9007199254740991,
        resource: { id: 1, name: 'Machine', metadata: { kind: 'device' }, documentationMarkdown: 'private docs' },
        user: {
          id: 2,
          username: 'operator',
          email: 'operator@example.test',
          billingFactor: 100,
          creditBalance: 123,
          passwordResetToken: 'secret',
        },
      },
      [
        {
          form: { id: 11, name: 'Checklist' },
          data: { 21: { fieldDefinition: { id: 21, name: 'Ready' }, value: 'yes' } },
        },
      ],
    );
    const wire = JSON.parse(JSON.stringify(payload));
    expect(wire).toMatchObject({
      id: 7,
      resourceId: 1,
      userId: 2,
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: null,
      creditsPerUsage: 9007199254740991,
      resource: { id: 1, metadata: { kind: 'device' } },
      formSubmissions: { 11: { formName: 'Checklist', answers: { 21: { value: 'yes', name: 'Ready' } } } },
    });
    expect(wire.user).toEqual({
      id: 2,
      username: 'operator',
      email: 'operator@example.test',
      billingFactor: 100,
      creditBalance: 123,
    });
    expect(wire.resource).not.toHaveProperty('documentationMarkdown');
  });
});
