import { PluginAdministrationService } from './plugin-administration.service';
import { PluginUninstallService } from './plugin-uninstall.service';
import { AUDIT_RECORDER } from '../audit/recorder/audit-event';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { PluginController } from './plugin.controller';
import { NpmPluginService } from './npm-plugin.service';
import { PluginService } from './plugin.service';
import { DEFAULT_PLUGIN_UPDATE_POLICY, patchUpdatePolicy } from './npm/update-policy';
import { PluginBleService } from './ble/plugin-ble.service';
import { PluginReadersService } from './readers/plugin-readers.service';

describe('npm plugin request DTOs (HTTP integration)', () => {
  let app: INestApplication;
  const npmPluginService = {
    addRegistry: jest.fn(),
    install: jest.fn(),
    listInstalled: jest.fn(),
    replaceInstalled: jest.fn(),
    updateVersionPolicy: jest.fn(),
    setUpdatePolicy: jest.fn(),
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
        { provide: AUDIT_RECORDER, useValue: { record: jest.fn() } },
        PluginAdministrationService,
        { provide: PluginBleService, useValue: { deleteAllForPlugin: jest.fn() } },
        { provide: PluginReadersService, useValue: { deleteAllForPlugin: jest.fn() } },
        PluginUninstallService,
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

  it.each([
    ['next', true, 'next'],
    ['latest', true, undefined],
    ['next', false, undefined],
  ])(
    'on a %s host with followHostChannel %s records %s for a marketplace install',
    async (channel, follow, recorded) => {
      const previous = process.env.ATTRACCESS_PLUGIN_CHANNEL;
      process.env.ATTRACCESS_PLUGIN_CHANNEL = channel;
      try {
        await request(app.getHttpServer())
          .post('/api/plugins/npm/example/versions/1.2.3')
          .send({ followHostChannel: follow })
          .expect(201);
        expect(npmPluginService.install).toHaveBeenCalledWith(
          'example',
          '1.2.3',
          undefined,
          expect.any(Object),
          undefined,
          recorded,
        );
      } finally {
        if (previous === undefined) delete process.env.ATTRACCESS_PLUGIN_CHANNEL;
        else process.env.ATTRACCESS_PLUGIN_CHANNEL = previous;
      }
    },
  );

  describe('POST /plugins/update-policy', () => {
    const post = (body: object) => request(app.getHttpServer()).post('/api/plugins/update-policy').send(body);
    const schedule = { weekdays: [1, 5], startMinute: 120, durationMinutes: 120, timeZone: 'Europe/Berlin' };

    beforeEach(() => {
      // The real validation behind the real pipe.
      npmPluginService.setUpdatePolicy.mockImplementation(async (patch: unknown) =>
        patchUpdatePolicy(DEFAULT_PLUGIN_UPDATE_POLICY, patch),
      );
    });

    it('accepts and returns the policy shape', async () => {
      const response = await post({ automaticUpdates: true, mode: 'patch', schedule }).expect(201);
      expect(response.body).toEqual({
        ...DEFAULT_PLUGIN_UPDATE_POLICY,
        automaticUpdates: true,
        mode: 'patch',
        schedule,
      });
    });

    it.each([
      ['switching on without a weekday', { automaticUpdates: true }],
      ['switching on with an empty list', { automaticUpdates: true, schedule: { ...schedule, weekdays: [] } }],
      ['an unknown time zone', { schedule: { timeZone: 'Mars/Olympus' } }],
      ['an offset as time zone', { schedule: { timeZone: '+01:00' } }],
      ['a weekday out of range', { schedule: { weekdays: [0] } }],
      ['a start past the day', { schedule: { startMinute: 1440 } }],
      ['a negative start', { schedule: { startMinute: -1 } }],
      ['no duration', { schedule: { durationMinutes: 0 } }],
      ['a duration over a day', { schedule: { durationMinutes: 1441 } }],
      ['a fractional duration', { schedule: { durationMinutes: 1.5 } }],
      ['the string "false" for the switch', { automaticUpdates: 'false' }],
      ['the string "true" for the switch', { automaticUpdates: 'true', schedule }],
      ['off as step limit', { mode: 'off' }],
      ['the earlier shape', { maintenanceWindow: { startMinute: 0, durationMinutes: 60 } }],
      ['an unknown schedule field', { schedule: { cron: '* * * * *' } }],
    ])('answers 400 for %s', async (_label, body) => {
      await post(body).expect(400);
    });

    it('needs system.plugins.manage', async () => {
      const granted = pluginManager.effectivePermissions;
      pluginManager.effectivePermissions = new Set(['system.settings.manage']);
      try {
        await post({ automaticUpdates: false }).expect(403);
        expect(npmPluginService.setUpdatePolicy).not.toHaveBeenCalled();
      } finally {
        pluginManager.effectivePermissions = granted;
      }
    });
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
      .send({ registryId: 'private', planToken: 'confirmed-dependency-plan' })
      .expect(201);
    expect(npmPluginService.install).toHaveBeenCalledWith(
      'example',
      '1.2.3',
      'private',
      expect.any(Object),
      'confirmed-dependency-plan',
      undefined,
    );

    await request(app.getHttpServer())
      .post('/api/plugins/installed/example/update-policy')
      .send({ requestedSpec: '^1.2.0', updateOverride: 'minor' })
      .expect(201);
    expect(npmPluginService.updateVersionPolicy).toHaveBeenCalledWith('example', '^1.2.0', 'minor');

    await request(app.getHttpServer())
      .post('/api/plugins/installed/example/versions/1.2.3')
      .send({
        approvedPermissionAdditions: ['resources.read'],
        approvedMajorVersion: true,
        planToken: 'confirmed-update-plan',
      })
      .expect(201);
    expect(npmPluginService.replaceInstalled).toHaveBeenCalledWith(
      'example',
      '1.2.3',
      ['resources.read'],
      true,
      expect.any(Object),
      'confirmed-update-plan',
    );
  });

  it.each(['true', 'false'])('rejects string major-version approval %s', async (approvedMajorVersion) => {
    await request(app.getHttpServer())
      .post('/api/plugins/installed/example/versions/2.0.0')
      .send({ approvedMajorVersion })
      .expect(400);

    expect(npmPluginService.replaceInstalled).not.toHaveBeenCalled();
  });
});
