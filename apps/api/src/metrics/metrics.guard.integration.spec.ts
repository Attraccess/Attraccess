import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MetricsController } from './metrics.controller';
import { MetricsGuard } from './metrics.guard';
import { MetricsService } from './metrics.service';
import { SettingsService } from '../settings/settings.service';
import { TokenHashService } from '../encryption/token-hash.service';

describe('MetricsGuard (HTTP integration)', () => {
  let app: INestApplication;
  let metricsApiKey: string | null = 'configured-key';

  const settingsServiceMock = {
    getMetricsApiKey: jest.fn(async () => ({
      value: metricsApiKey,
      configured: metricsApiKey !== null,
    })),
  };

  const metricsServiceMock = {
    getMetrics: jest.fn(async () => '# HELP test metric\ntest 1\n'),
    getContentType: jest.fn(() => 'text/plain; version=0.0.4; charset=utf-8'),
  };

  const tokenHashServiceMock = {
    hashToken: jest.fn((token: string) => {
      const { createHmac } = require('crypto');
      return createHmac('sha256', 'test-secret').update(token).digest('base64url');
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsGuard,
        { provide: MetricsService, useValue: metricsServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: TokenHashService, useValue: tokenHashServiceMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    metricsApiKey = 'configured-key';
    jest.clearAllMocks();
  });

  it('returns 403 when no API key is configured on the server', async () => {
    metricsApiKey = null;
    await request(app.getHttpServer()).get('/api/metrics').expect(403);
  });

  it('returns 401 when the Authorization header is missing', async () => {
    await request(app.getHttpServer()).get('/api/metrics').expect(401);
  });

  it('returns 401 when the Authorization scheme is not Bearer', async () => {
    await request(app.getHttpServer())
      .get('/api/metrics')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .expect(401);
  });

  it('returns 401 when the bearer token does not match', async () => {
    await request(app.getHttpServer())
      .get('/api/metrics')
      .set('Authorization', 'Bearer wrong-key')
      .expect(401);
  });

  it('returns 401 (not 200) when the key is passed via query param', async () => {
    await request(app.getHttpServer())
      .get('/api/metrics?api_key=configured-key')
      .expect(401);
  });

  it('returns 200 and the Prometheus exposition when the bearer matches', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/metrics')
      .set('Authorization', 'Bearer configured-key')
      .expect(200);

    expect(response.text).toContain('# HELP test metric');
    expect(response.text).toContain('test 1');
    expect(response.headers['content-type']).toMatch(/text\/plain/);
  });
});
