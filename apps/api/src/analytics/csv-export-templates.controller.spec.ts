import {
  ConflictException,
  ExecutionContext,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { CsvExportTemplatesController } from './csv-export-templates.controller';
import { CsvExportTemplatesService } from './csv-export-templates.service';

describe('CsvExportTemplatesController (HTTP)', () => {
  let app: INestApplication;
  let permissions: string[];

  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const validBody = {
    name: '  Accounting  ',
    exportType: 'resourceUsageHours',
    columns: [
      { type: 'field', header: '', fieldKey: 'resourceName' },
      { type: 'constant', header: 'Org', value: '' },
    ],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CsvExportTemplatesController],
      providers: [{ provide: CsvExportTemplatesService, useValue: service }, DualAuthGuard, EffectivePermissionsGuard],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            id: 1,
            jwtTokenId: 'tok',
            authenticationMethod: 'session',
            effectivePermissions: new Set(permissions),
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permissions = ['resources.reports.export'];
    service.create.mockImplementation(async (dto) => ({ id: 1, ...dto }));
  });

  it.each([['resources.reports.export'], ['billing.manage']])('allows %s', async (permission) => {
    permissions = [permission];
    service.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/analytics/csv-export-templates?exportType=billingTransactions')
      .expect(200);

    expect(service.findAll).toHaveBeenCalledWith('billingTransactions');
  });

  it('answers 403 without an export permission on every route', async () => {
    permissions = ['resources.update'];
    const server = app.getHttpServer();

    await request(server).get('/analytics/csv-export-templates').expect(403);
    await request(server).get('/analytics/csv-export-templates/1').expect(403);
    await request(server).post('/analytics/csv-export-templates').send(validBody).expect(403);
    await request(server).patch('/analytics/csv-export-templates/1').send({ name: 'x' }).expect(403);
    await request(server).delete('/analytics/csv-export-templates/1').expect(403);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('trims the name and accepts an empty constant value and an empty header', async () => {
    await request(app.getHttpServer()).post('/analytics/csv-export-templates').send(validBody).expect(201);

    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Accounting' }));
  });

  it.each([
    ['unknown export type', { ...validBody, exportType: 'nope' }],
    ['blank name', { ...validBody, name: '   ' }],
    ['name over 120 characters', { ...validBody, name: 'a'.repeat(121) }],
    ['no columns', { ...validBody, columns: [] }],
    [
      'more than 200 columns',
      { ...validBody, columns: Array(201).fill({ type: 'constant', header: 'h', value: 'v' }) },
    ],
    ['field column without fieldKey', { ...validBody, columns: [{ type: 'field', header: 'h' }] }],
    ['field column with empty fieldKey', { ...validBody, columns: [{ type: 'field', header: 'h', fieldKey: '' }] }],
    [
      'header over 255 characters',
      { ...validBody, columns: [{ type: 'constant', header: 'h'.repeat(256), value: '' }] },
    ],
    [
      'constant over 1024 characters',
      { ...validBody, columns: [{ type: 'constant', header: 'h', value: 'v'.repeat(1025) }] },
    ],
    ['unknown column type', { ...validBody, columns: [{ type: 'other', header: 'h' }] }],
  ])('rejects %s with 400', async (_label, body) => {
    await request(app.getHttpServer()).post('/analytics/csv-export-templates').send(body).expect(400);

    expect(service.create).not.toHaveBeenCalled();
  });

  it('accepts exactly 200 columns', async () => {
    const columns = Array(200).fill({ type: 'constant', header: 'h', value: 'v' });

    await request(app.getHttpServer())
      .post('/analytics/csv-export-templates')
      .send({ ...validBody, columns })
      .expect(201);
  });

  it('maps a duplicate name to 409 with a clear message', async () => {
    service.create.mockRejectedValue(new ConflictException('A CSV export template named "x" already exists'));

    const response = await request(app.getHttpServer())
      .post('/analytics/csv-export-templates')
      .send(validBody)
      .expect(409);

    expect(response.body.message).toContain('already exists');
  });

  it('maps an unknown id to 404 on get, patch and delete', async () => {
    const error = new NotFoundException('missing');
    service.findOne.mockRejectedValue(error);
    service.update.mockRejectedValue(error);
    service.remove.mockRejectedValue(error);
    const server = app.getHttpServer();

    await request(server).get('/analytics/csv-export-templates/999').expect(404);
    await request(server).patch('/analytics/csv-export-templates/999').send({ name: 'x' }).expect(404);
    await request(server).delete('/analytics/csv-export-templates/999').expect(404);
  });

  it('deletes with 204', async () => {
    service.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer()).delete('/analytics/csv-export-templates/3').expect(204);

    expect(service.remove).toHaveBeenCalledWith(3);
  });
});
