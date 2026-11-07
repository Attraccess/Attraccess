import { AuthenticatedRequest, DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { LicenseService } from '../license/license.service';
import { projectAdministrationAuditEvent } from '../audit/policies/administration';
import { CardWriterSettingsController, cardWriterSettingChanges } from './card-writer-settings.controller';
import { AttractapService } from './attractap.service';
import { CardWriterPolicyService } from './websockets/card-writer-policy.service';
import { CardWriterSettingsDto } from './dtos/card-writer-settings.dto';

const guardFor = (method: 'get' | 'update') => {
  const handler = CardWriterSettingsController.prototype[method];
  expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(
    expect.arrayContaining([DualAuthGuard, EffectivePermissionsGuard]),
  );
  const request = { user: undefined as { id: number; effectivePermissions: Set<string> } | undefined };
  const context = new ExecutionContextHost([request], CardWriterSettingsController, handler);
  return { request, check: () => new EffectivePermissionsGuard(new Reflector()).canActivate(context) };
};

describe('CardWriterSettingsController', () => {
  describe('permissions', () => {
    it('lets every signed-in user read the setting (the own-card enrollment picker needs it)', () => {
      const { request, check } = guardFor('get');
      request.user = { id: 1, effectivePermissions: new Set() };
      expect(check()).toBe(true);
    });

    it('requires system.settings.manage to change the setting', () => {
      const { request, check } = guardFor('update');
      expect(() => check()).toThrow('Unauthorized');
      request.user = { id: 1, effectivePermissions: new Set(['users.rfid-cards.manage']) };
      expect(() => check()).toThrow('Insufficient permissions');
      request.user.effectivePermissions.add('system.settings.manage');
      expect(check()).toBe(true);
    });
  });

  describe('readers that are not paired', () => {
    const paired = [{ id: 2 }, { id: 5 }];
    let stored: CardWriterSettingsDto;
    let controller: CardWriterSettingsController;
    const set = jest.fn(async (next: CardWriterSettingsDto) => (stored = { ...next }));

    beforeEach(async () => {
      set.mockClear();
      stored = { mode: 'selected', readerIds: [2, 3, 5] };
      const moduleRef = await Test.createTestingModule({
        controllers: [CardWriterSettingsController],
        providers: [
          { provide: CardWriterPolicyService, useValue: { get: jest.fn(async () => stored), set } },
          { provide: AttractapService, useValue: { getPairedReaders: jest.fn(async () => paired) } },
          {
            provide: AuditService,
            useValue: { recordAdministration: jest.fn().mockResolvedValue({ status: 'recorded' }) },
          },
          { provide: LicenseService, useValue: {} },
        ],
      }).compile();
      controller = moduleRef.get(CardWriterSettingsController);
    });

    it('never reports a reader that is not paired, even one named before its pairing was removed', async () => {
      await expect(controller.get()).resolves.toEqual({ mode: 'selected', readerIds: [2, 5] });
    });

    it('refuses to save a reader that is not paired', async () => {
      await expect(
        controller.update({ mode: 'selected', readerIds: [2, 3] }, { user: { id: 1 } } as AuthenticatedRequest),
      ).rejects.toThrow('READER_NOT_PAIRED');
      expect(set).not.toHaveBeenCalled();
    });

    it('saves paired readers', async () => {
      await controller.update({ mode: 'selected', readerIds: [5] }, { user: { id: 1 } } as AuthenticatedRequest);
      expect(set).toHaveBeenCalledWith({ mode: 'selected', readerIds: [5] });
    });
  });

  describe('PUT audit', () => {
    let current: CardWriterSettingsDto;
    let controller: CardWriterSettingsController;
    const recordAdministration = jest.fn().mockResolvedValue({ status: 'recorded' });
    const req = { user: { id: 42, authenticationMethod: 'session' } } as AuthenticatedRequest;

    beforeEach(async () => {
      recordAdministration.mockClear();
      current = { mode: 'all', readerIds: [] };
      const moduleRef = await Test.createTestingModule({
        controllers: [CardWriterSettingsController],
        providers: [
          {
            provide: CardWriterPolicyService,
            useValue: {
              get: jest.fn(async () => current),
              set: jest.fn(async (next: CardWriterSettingsDto) => (current = { ...next })),
            },
          },
          { provide: AttractapService, useValue: { getPairedReaders: jest.fn(async () => [{ id: 2 }, { id: 5 }]) } },
          { provide: AuditService, useValue: { recordAdministration } },
          { provide: LicenseService, useValue: {} },
        ],
      }).compile();
      controller = moduleRef.get(CardWriterSettingsController);
    });

    it('records the old and new mode and reader list', async () => {
      await controller.update({ mode: 'selected', readerIds: [2, 5] }, req);
      const events = recordAdministration.mock.calls.map(([event]) => event);
      expect(events).toEqual([
        expect.objectContaining({
          action: 'settings.updated',
          actorId: 42,
          subjectType: 'setting',
          details: { settingKey: 'attractap.cardWriterMode', before: 'all', after: 'selected' },
        }),
        expect.objectContaining({
          details: { settingKey: 'attractap.cardWriterReaders', before: '', after: '2,5' },
        }),
      ]);
    });

    it('records nothing when nothing changed', async () => {
      current = { mode: 'selected', readerIds: [2] };
      await controller.update({ mode: 'selected', readerIds: [2] }, req);
      expect(recordAdministration).not.toHaveBeenCalled();
    });

    it('records the removal of a reader whose pairing was revoked', async () => {
      // Reader 3 was selected, then its pairing was revoked: GET no longer shows it, the stored setting still does.
      current = { mode: 'selected', readerIds: [2, 3, 5] };
      await controller.update({ mode: 'selected', readerIds: [2, 5] }, req);
      expect(recordAdministration.mock.calls.map(([event]) => event.details)).toEqual([
        { settingKey: 'attractap.cardWriterReaders', before: '2,3,5', after: '2,5' },
      ]);
    });

    it('still returns the saved setting when the audit provider fails', async () => {
      recordAdministration.mockRejectedValueOnce(new Error('down'));
      await expect(controller.update({ mode: 'selected', readerIds: [2] }, req)).resolves.toEqual({
        mode: 'selected',
        readerIds: [2],
      });
    });
  });

  it('records a reader count instead of a list that does not fit an audit value', () => {
    const many = Array.from({ length: 100 }, (_, i) => 1000 + i);
    expect(
      cardWriterSettingChanges({ mode: 'selected', readerIds: [1] }, { mode: 'selected', readerIds: many }),
    ).toEqual([['attractap.cardWriterReaderCount', '1', '100']]);
  });

  it('produces events the administration audit policy accepts', () => {
    for (const [settingKey, before, after] of cardWriterSettingChanges(
      { mode: 'all', readerIds: [] },
      { mode: 'selected', readerIds: [2, 5] },
    )) {
      expect(
        projectAdministrationAuditEvent({
          action: 'settings.updated',
          actorId: 1,
          subjectType: 'setting',
          subjectId: 1,
          details: { settingKey, before, after },
        }),
      ).not.toBeNull();
    }
  });
});
