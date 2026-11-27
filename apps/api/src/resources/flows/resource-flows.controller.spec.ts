import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Subject } from 'rxjs';
import supertest from 'supertest';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';
import { ResourceListVisibilityService } from '../visibility/resource-list-visibility.service';
import { ResourceFlowsExecutorService } from './execution/resource-flows-executor.service';
import { FlowLogRecorderService } from './logs/flow-log-recorder.service';
import { ResourceFlowsController } from './resource-flows.controller';
import { ResourceFlowsService } from './resource-flows.service';

// The flow log routes of a resource flow; the editor keeps a recording alive, nothing starts or stops one.
const logRoutes = [
  { method: 'get', path: '/resources/7/flow/logs', status: 200 },
  { method: 'get', path: '/resources/7/flow/logs/recording', status: 200 },
  { method: 'post', path: '/resources/7/flow/logs/recording/keep-alive', status: 201 },
] as const;

describe('ResourceFlowsController flow log routes', () => {
  const permissions = new Set<string>();
  const flowLogs = {
    getLogs: jest.fn().mockReturnValue({ logs: [] }),
    getStatus: jest.fn().mockReturnValue({ isRecording: false }),
    keepAlive: jest.fn().mockReturnValue({ isRecording: true }),
    subjectFor: jest.fn(() => new Subject()),
    releaseSubject: jest.fn(),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceFlowsController],
      providers: [
        { provide: ResourceFlowsService, useValue: {} },
        { provide: ResourceFlowsExecutorService, useValue: {} },
        { provide: FlowLogRecorderService, useValue: flowLogs },
        { provide: SseInstrumentation, useValue: { wrap: jest.fn() } },
        { provide: ResourceListVisibilityService, useValue: { canSee: jest.fn(async () => true) } },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: 9, effectivePermissions: permissions };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    permissions.clear();
  });

  const send = (method: 'get' | 'post' | 'delete', path: string) => supertest(app.getHttpServer())[method](path);

  it.each(logRoutes)('$method $path is forbidden without resources.update', async ({ method, path }) => {
    permissions.add('resources.read');
    await send(method, path).expect(403);
    for (const mock of Object.values(flowLogs)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it.each(logRoutes)('$method $path is allowed with resources.update', async ({ method, path, status }) => {
    permissions.add('resources.update');
    await send(method, path).expect(status);
  });

  it('keeps the recording alive under the resource id', async () => {
    permissions.add('resources.update');
    await send('post', '/resources/7/flow/logs/recording/keep-alive').expect(201);
    expect(flowLogs.keepAlive).toHaveBeenCalledWith(7);
  });

  it('never starts or extends a recording when reading the status or the logs', async () => {
    permissions.add('resources.update');
    await send('get', '/resources/7/flow/logs/recording').expect(200);
    await send('get', '/resources/7/flow/logs').expect(200);
    expect(flowLogs.keepAlive).not.toHaveBeenCalled();
  });

  it.each(['post', 'delete'] as const)('no longer has the %s recording route', async (method) => {
    permissions.add('resources.update');
    await send(method, '/resources/7/flow/logs/recording').expect(404);
  });
});
