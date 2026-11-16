import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { CsvExportTemplate } from '@attraccess/database-entities';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { CsvExportTemplatesController } from '../analytics/csv-export-templates.controller';
import { CsvExportTemplatesService } from '../analytics/csv-export-templates.service';

jest.setTimeout(120_000);

// Real SQLite database (all migrations applied) behind the real controller and service:
// proves the migration's table and unique constraint, and the HTTP error mapping end to end.
describe('CSV export templates API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let storageRoot: string;
  let permissions: string[] = ['resources.reports.export'];

  const url = '/analytics/csv-export-templates';
  const columns = [
    { type: 'field', header: '', fieldKey: 'resourceName' },
    { type: 'constant', header: 'Org', value: '' },
  ];

  beforeAll(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'attraccess-csv-templates-e2e-'));
    process.env.STORAGE_ROOT = storageRoot;
    const dsModule = await import('../database/datasource');
    dataSource = (dsModule as unknown as { default: DataSource }).default;
    if (!dataSource.isInitialized) await dataSource.initialize();
    await dataSource.runMigrations();

    const module = await Test.createTestingModule({
      controllers: [CsvExportTemplatesController],
      providers: [
        CsvExportTemplatesService,
        { provide: getRepositoryToken(CsvExportTemplate), useValue: dataSource.getRepository(CsvExportTemplate) },
        DualAuthGuard,
        EffectivePermissionsGuard,
      ],
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
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    permissions = ['resources.reports.export'];
    await dataSource.getRepository(CsvExportTemplate).clear();
  });

  it('creates, lists (per type, sorted by name), reads, updates and deletes a template', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post(url)
      .send({ name: ' Zeta ', exportType: 'resourceUsageHours', columns })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Zeta', exportType: 'resourceUsageHours', columns });
    await request(server).post(url).send({ name: 'Alpha', exportType: 'resourceUsageHours', columns }).expect(201);
    await request(server).post(url).send({ name: 'Billing', exportType: 'billingTransactions', columns }).expect(201);

    const usage = await request(server).get(`${url}?exportType=resourceUsageHours`).expect(200);
    expect(usage.body.map((template: { name: string }) => template.name)).toEqual(['Alpha', 'Zeta']);
    const all = await request(server).get(url).expect(200);
    expect(all.body).toHaveLength(3);

    await request(server).get(`${url}/${created.body.id}`).expect(200);
    const updated = await request(server)
      .patch(`${url}/${created.body.id}`)
      .send({ name: 'Zeta 2', columns: [columns[1]] })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Zeta 2', columns: [columns[1]] });

    await request(server).delete(`${url}/${created.body.id}`).expect(204);
    await request(server).get(`${url}/${created.body.id}`).expect(404);
  });

  it('answers 409 for a duplicate name per export type, but allows the same name for another type', async () => {
    const server = app.getHttpServer();
    await request(server).post(url).send({ name: 'Same', exportType: 'resourceUsageHours', columns }).expect(201);

    const duplicate = await request(server)
      .post(url)
      .send({ name: 'Same', exportType: 'resourceUsageHours', columns })
      .expect(409);
    expect(duplicate.body.message).toContain('already exists');
    await request(server).post(url).send({ name: 'Same', exportType: 'billingTransactions', columns }).expect(201);

    const other = await request(server)
      .post(url)
      .send({ name: 'Other', exportType: 'resourceUsageHours', columns })
      .expect(201);
    await request(server).patch(`${url}/${other.body.id}`).send({ name: 'Same' }).expect(409);
  });

  it('answers 404 for unknown ids, 400 for invalid columns and 403 without an export permission', async () => {
    const server = app.getHttpServer();
    await request(server).get(`${url}/9999`).expect(404);
    await request(server).patch(`${url}/9999`).send({ name: 'x' }).expect(404);
    await request(server).delete(`${url}/9999`).expect(404);
    await request(server)
      .post(url)
      .send({ name: 'Bad', exportType: 'resourceUsageHours', columns: [{ type: 'field', header: '' }] })
      .expect(400);
    const existing = await request(server)
      .post(url)
      .send({ name: 'Existing', exportType: 'resourceUsageHours', columns })
      .expect(201);
    await request(server).patch(`${url}/${existing.body.id}`).send({ name: null }).expect(400);
    await request(server).get(`${url}/${existing.body.id}`).expect(200);

    permissions = ['billing.manage'];
    await request(server).get(url).expect(200);
    permissions = [];
    await request(server).get(url).expect(403);
    await request(server).post(url).send({ name: 'x', exportType: 'resourceUsageHours', columns }).expect(403);
  });
});
