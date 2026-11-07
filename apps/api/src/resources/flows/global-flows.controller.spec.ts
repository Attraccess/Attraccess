import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of, Subject } from 'rxjs';
import supertest from 'supertest';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';
import { GlobalFlowsController } from './global-flows.controller';
import { GlobalFlowsService } from './global-flows.service';
import { FlowLogRecorderService } from './logs/flow-log-recorder.service';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

// Every route of the controller with a body that reaches the service.
const routes: { method: Method; path: string; body?: object; status: number }[] = [
  { method: 'get', path: '/flows', status: 200 },
  { method: 'post', path: '/flows', body: { name: 'Notify' }, status: 201 },
  { method: 'get', path: '/flows/node-schemas', status: 200 },
  { method: 'get', path: '/flows/5', status: 200 },
  { method: 'patch', path: '/flows/5', body: { enabled: false }, status: 200 },
  { method: 'delete', path: '/flows/5', status: 200 },
  { method: 'get', path: '/flows/5/canvas', status: 200 },
  { method: 'put', path: '/flows/5/canvas', body: { nodes: [], edges: [] }, status: 200 },
  { method: 'post', path: '/flows/5/node-schemas/plugin.test.node', body: { config: {} }, status: 201 },
  { method: 'post', path: '/flows/5/node-previews/plugin.test.node', body: { config: {} }, status: 201 },
  { method: 'get', path: '/flows/5/logs', status: 200 },
  { method: 'get', path: '/flows/5/logs/recording', status: 200 },
  { method: 'post', path: '/flows/5/logs/recording', body: { durationMinutes: 5 }, status: 201 },
  { method: 'delete', path: '/flows/5/logs/recording', status: 200 },
  { method: 'get', path: '/flows/5/logs/live', status: 200 },
];

describe('GlobalFlowsController permissions', () => {
  const permissions = new Set<string>();
  const globalFlows = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 5 }),
    getNodeSchemas: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({ id: 5 }),
    update: jest.fn().mockResolvedValue({ id: 5 }),
    delete: jest.fn().mockResolvedValue(undefined),
    getCanvas: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    saveCanvas: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    resolveNodeSchema: jest.fn().mockResolvedValue({ type: 'plugin.test.node' }),
  };
  const flowLogs = {
    getLogs: jest.fn().mockReturnValue({ logs: [] }),
    getStatus: jest.fn().mockReturnValue({ recording: false }),
    start: jest.fn().mockReturnValue({ recording: true }),
    stop: jest.fn().mockReturnValue({ recording: false }),
    subjectFor: jest.fn(() => new Subject()),
    releaseSubject: jest.fn(),
  };
  // A finite stream so the live log request ends.
  const sse = { wrap: jest.fn(() => of({ data: { keepalive: true } })) };
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GlobalFlowsController],
      providers: [
        { provide: GlobalFlowsService, useValue: globalFlows },
        { provide: FlowLogRecorderService, useValue: flowLogs },
        { provide: SseInstrumentation, useValue: sse },
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

  const send = ({ method, path, body }: (typeof routes)[number]) => {
    const request = supertest(app.getHttpServer())[method](path);
    return body ? request.send(body) : request;
  };

  it.each(routes)('$method $path is forbidden without resources.update', async (route) => {
    permissions.add('resources.read');
    await send(route).expect(403);
    for (const mock of [...Object.values(globalFlows), ...Object.values(flowLogs), sse.wrap]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it.each(routes)('$method $path is allowed with resources.update', async (route) => {
    permissions.add('resources.update');
    await send(route).expect(route.status);
  });
});
