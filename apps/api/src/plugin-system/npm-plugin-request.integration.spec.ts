import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { AuditService } from '../audit/audit.service';
import { PluginController } from './plugin.controller';
import { NpmPluginService } from './npm-plugin.service';
import { PluginService } from './plugin.service';

describe('npm plugin request DTOs (HTTP integration)', () => {
  let app: INestApplication;
const npmPluginService = {
    addRegistry: jest.fn(),
    install: jest.fn(),
    listInstalled: jest.fn(),
    replaceInstalled: jest.fn(),
    updateVersionPolicy: jest.fn(),
  };
  const pluginManager = {
    id: 1,
    jwtTokenId: 'test-token',
    authenticationMethod: 'session',
    effectivePermissions: new Set(['system.plugins.manage']),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PluginController],
      providers: [
        { provide: PluginService, useValue: { requestRestart: jest.fn() } },
        { provide: NpmPluginService, useValue: npmPluginService },
        { provide: AuditService, useValue: { recordAdministration: jest.fn() } },
        DualAuthGuard,
        EffectivePermissionsGuard,
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = pluginManager;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    npmPluginService.addRegistry.mockResolvedValue({ id: 'private', name: 'Private', url: 'https://registry.example' });
    npmPluginService.install.mockResolvedValue({ name: 'example', state: 'active' });
    npmPluginService.listInstalled.mockReturnValue([{ name: 'example', requestedSpec: '^1.0.0' }]);
    npmPluginService.replaceInstalled.mockResolvedValue({ name: 'example', state: 'active' });
    npmPluginService.updateVersionPolicy.mockResolvedValue({ name: 'example' });
  });

  it('preserves valid request properties through the global whitelist', async () => {
    await request(app.getHttpServer())
      .post('/api/plugins/registries')
      .send({ name: 'Private', url: 'https://registry.example', token: 'secret' })
      .expect(201);
    expect(npmPluginService.addRegistry).toHaveBeenCalledWith({
      name: 'Private',
      url: 'https://registry.example',
      token: 'secret',
    });

    await request(app.getHttpServer())
      .post('/api/plugins/npm/example/versions/1.2.3')
      .send({ registryId: 'private' })
      .expect(201);
    expect(npmPluginService.install).toHaveBeenCalledWith('example', '1.2.3', 'private', expect.any(Object));

    await request(app.getHttpServer())
      .post('/api/plugins/installed/example/update-policy')
      .send({ requestedSpec: '^1.2.0', updateOverride: 'minor' })
      .expect(201);
    expect(npmPluginService.updateVersionPolicy).toHaveBeenCalledWith('example', '^1.2.0', 'minor');

    await request(app.getHttpServer())
      .post('/api/plugins/installed/example/versions/1.2.3')
      .send({ approvedPermissionAdditions: ['resources.read'], approvedMajorVersion: true })
      .expect(201);
    expect(npmPluginService.replaceInstalled).toHaveBeenCalledWith(
      'example',
      '1.2.3',
      ['resources.read'],
      true,
      expect.any(Object),
    );
  });
});
