import { AUDIT_RECORDER } from '../audit/recorder/audit-event';
import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { SettingsController } from './settings.controller';
import { SettingsAdministrationService } from './settings-administration.service';
import { SettingsService } from './settings.service';
import { RESOURCES_KEYS, RESOURCES_PARENT } from './constants';

@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.user = { id: 1, effectivePermissions: new Set(JSON.parse(request.headers['x-test-permissions'] ?? '[]')) };
    return true;
  }
}

describe('resource activity visibility setting (ATT-1149)', () => {
  describe('stored value', () => {
    const serviceWith = (stored: unknown) => {
      const store = { getPlainSetting: jest.fn(async () => stored), setPlainSetting: jest.fn() };
      return {
        store,
        service: new SettingsService({} as never, store as never, {} as never),
      };
    };

    it.each([undefined, null, '', 'garbage'])('falls back to "all" when the stored value is %p', async (stored) => {
      const { service, store } = serviceWith(stored);
      expect(await service.getResourceActivityVisibility()).toBe('all');
      expect(store.getPlainSetting).toHaveBeenCalledWith(RESOURCES_PARENT, RESOURCES_KEYS.activityVisibility);
    });

    it('reads "introduced" when it is stored', async () => {
      expect(await serviceWith('introduced').service.getResourceActivityVisibility()).toBe('introduced');
    });
  });

  describe('HTTP', () => {
    let app: INestApplication;
    const settingsService = {
      getResourceVisibilitySettings: jest.fn(async () => ({ activityVisibility: 'all' })),
      updateResourceVisibilitySettings: jest.fn(async () => ({ activityVisibility: 'introduced' })),
    };
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

    beforeEach(async () => {
      jest.clearAllMocks();
      const moduleRef = await Test.createTestingModule({
        controllers: [SettingsController],
        providers: [
          { provide: SettingsService, useValue: settingsService },
          SettingsAdministrationService,
          { provide: AUDIT_RECORDER, useValue: audit },
        ],
      })
        .overrideGuard(DualAuthGuard)
        .useClass(HeaderAuthGuard)
        .compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    const call = (method: 'get' | 'patch', permissions: string[]) =>
      supertest(app.getHttpServer())
        [method]('/settings/resources/visibility')
        .set('x-test-permissions', JSON.stringify(permissions));

    it.each([[[]], [['resources.read']], [['resources.update', 'resources.access.manage']]])(
      'refuses reads and changes without "manage system settings" (%p)',
      async (permissions) => {
        expect((await call('get', permissions)).status).toBe(403);
        expect((await call('patch', permissions).send({ activityVisibility: 'introduced' })).status).toBe(403);
        expect(settingsService.updateResourceVisibilitySettings).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      },
    );

    it('lets "manage system settings" change it and rejects unknown values', async () => {
      const permissions = ['system.settings.manage'];
      expect((await call('get', permissions)).body).toEqual({ activityVisibility: 'all' });
      expect((await call('patch', permissions).send({ activityVisibility: 'everyone' })).status).toBe(400);
      const saved = await call('patch', permissions).send({ activityVisibility: 'introduced' });
      expect(saved.status).toBe(200);
      expect(saved.body).toEqual({ activityVisibility: 'introduced' });
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('machine list visibility (ATT-843)', () => {
    const serviceWith = (stored: unknown) => {
      const store = { getPlainSetting: jest.fn(async () => stored), setPlainSetting: jest.fn() };
      return { store, service: new SettingsService({} as never, store as never, {} as never) };
    };

    it.each([undefined, null, '', 'public', 'garbage'])(
      'falls back to the restrictive "permitted-only" when the stored value is %p',
      async (stored) => {
        const { service, store } = serviceWith(stored);
        expect(await service.getResourceListVisibility()).toBe('permitted-only');
        expect(store.getPlainSetting).toHaveBeenCalledWith(RESOURCES_PARENT, RESOURCES_KEYS.listVisibility);
      },
    );

    it('reads "authenticated" when it is stored', async () => {
      expect(await serviceWith('authenticated').service.getResourceListVisibility()).toBe('authenticated');
    });

    it('stores only the field that was sent', async () => {
      const { service, store } = serviceWith('permitted-only');
      await service.updateResourceVisibilitySettings({ listVisibility: 'authenticated' });
      expect(store.setPlainSetting).toHaveBeenCalledTimes(1);
      expect(store.setPlainSetting).toHaveBeenCalledWith(RESOURCES_PARENT, 'list_visibility', 'authenticated');
    });

    it('stores both fields when both are sent', async () => {
      const { service, store } = serviceWith('permitted-only');
      await service.updateResourceVisibilitySettings({
        activityVisibility: 'introduced',
        listVisibility: 'authenticated',
      });
      expect(store.setPlainSetting).toHaveBeenCalledTimes(2);
      expect(store.setPlainSetting).toHaveBeenCalledWith(RESOURCES_PARENT, 'activity_visibility', 'introduced');
      expect(store.setPlainSetting).toHaveBeenCalledWith(RESOURCES_PARENT, 'list_visibility', 'authenticated');
    });

    it('rejects "public" and other values over HTTP, and accepts the two modes on their own', async () => {
      const settingsService = {
        getResourceVisibilitySettings: jest.fn(async () => ({
          activityVisibility: 'all',
          listVisibility: 'permitted-only',
        })),
        updateResourceVisibilitySettings: jest.fn(async () => ({
          activityVisibility: 'all',
          listVisibility: 'authenticated',
        })),
      };
      const moduleRef = await Test.createTestingModule({
        controllers: [SettingsController],
        providers: [
          { provide: SettingsService, useValue: settingsService },
          SettingsAdministrationService,
          { provide: AUDIT_RECORDER, useValue: { record: jest.fn().mockResolvedValue({ status: 'recorded' }) } },
        ],
      })
        .overrideGuard(DualAuthGuard)
        .useClass(HeaderAuthGuard)
        .compile();
      const app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
      await app.init();
      try {
        const patch = (body: object) =>
          supertest(app.getHttpServer())
            .patch('/settings/resources/visibility')
            .set('x-test-permissions', JSON.stringify(['system.settings.manage']))
            .send(body);
        expect((await patch({ listVisibility: 'public' })).status).toBe(400);
        // "all" is a value of the activity setting, not of the list setting.
        expect((await patch({ listVisibility: 'all' })).status).toBe(400);
        expect((await patch({ activityVisibility: 'introduced', listVisibility: 'all' })).status).toBe(400);
        expect(settingsService.updateResourceVisibilitySettings).not.toHaveBeenCalled();
        expect((await patch({ listVisibility: 'authenticated' })).status).toBe(200);
        expect(settingsService.updateResourceVisibilitySettings).toHaveBeenCalledWith({
          listVisibility: 'authenticated',
        });
        const both = await patch({ activityVisibility: 'introduced', listVisibility: 'permitted-only' });
        expect(both.status).toBe(200);
        expect(settingsService.updateResourceVisibilitySettings).toHaveBeenLastCalledWith({
          activityVisibility: 'introduced',
          listVisibility: 'permitted-only',
        });
      } finally {
        await app.close();
      }
    });
  });
});
