// Controller integration tests for resource-scope introduction schedules
// FEATURE: User retraining requirement (ATT-106)
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DualAuthGuard, SystemPermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { IntroductionScheduleController } from './introduction-schedule.controller';
import { IntroductionScheduleService } from './introduction-schedule.service';

describe('IntroductionScheduleController (resource)', () => {
  let app: INestApplication;
  const svc = {
    findAll: jest.fn(),
    getOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [IntroductionScheduleController],
      providers: [{ provide: IntroductionScheduleService, useValue: svc }],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SystemPermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    Object.values(svc).forEach((fn) => fn.mockReset());
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET list calls service.findAll', async () => {
    svc.findAll.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/resources/1/introduction-schedules').expect(200);
    expect(svc.findAll).toHaveBeenCalledWith({ resourceId: 1 });
  });

  it('POST validates triggerType+config', async () => {
    await request(app.getHttpServer())
      .post('/resources/1/introduction-schedules')
      .send({ triggerType: 'TIME_SINCE_INTRODUCTION' })
      .expect(400);
  });

  it('POST creates valid TIME_SINCE_INTRODUCTION schedule', async () => {
    svc.create.mockResolvedValue({ id: 5 });
    await request(app.getHttpServer())
      .post('/resources/1/introduction-schedules')
      .send({
        triggerType: 'TIME_SINCE_INTRODUCTION',
        timeSinceIntroductionConfig: { duration: 1, unit: 'YEARS' },
      })
      .expect(201);
    expect(svc.create).toHaveBeenCalledWith({ resourceId: 1 }, expect.any(Object));
  });

  it('PATCH updates', async () => {
    svc.update.mockResolvedValue({});
    await request(app.getHttpServer())
      .patch('/resources/1/introduction-schedules/5')
      .send({ enabled: false })
      .expect(200);
  });

  it('DELETE returns 204', async () => {
    svc.delete.mockResolvedValue(undefined);
    await request(app.getHttpServer()).delete('/resources/1/introduction-schedules/5').expect(204);
  });
});
