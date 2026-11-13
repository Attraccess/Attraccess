import { AUDIT_RECORDER } from '../audit/recorder/audit-event';
import { AuthenticatedRequest, DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { LicenseService } from '../license/license.service';
import { projectAdministrationAuditEvent } from '../audit/policies/administration';
import { CardWriterSettingsController } from './card-writer-settings.controller';
import { AttractapService } from './attractap.service';
import { CardWriterPolicyService, cardWriterSettingChanges } from './websockets/card-writer-policy.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { ATTRACTAP_KEYS, ATTRACTAP_PARENT } from '../settings/constants';
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
          { provide: CardWriterPolicyService, useValue: { get: jest.fn(async () => stored), update: set } },
          { provide: AttractapService, useValue: { getPairedReaders: jest.fn(async () => paired) } },
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
      expect(set).toHaveBeenCalledWith(
        { mode: 'selected', readerIds: [5] },
        { id: 1, authenticationMethod: 'session' },
      );
    });
  });

  // The policy service records the change; the controller only names the actor.
  describe('PUT audit', () => {
    let current: CardWriterSettingsDto;
    let controller: CardWriterSettingsController;
    const record = jest.fn().mockResolvedValue({ status: 'recorded' });
    const req = { user: { id: 42, authenticationMethod: 'session' } } as AuthenticatedRequest;

    beforeEach(async () => {
      record.mockClear();
      current = { mode: 'all', readerIds: [] };
      const moduleRef = await Test.createTestingModule({
        controllers: [CardWriterSettingsController],
        providers: [
          CardWriterPolicyService,
          {
            provide: SettingsStoreService,
            useValue: {
              getPlainSetting: jest.fn(async (_parent: string, key: string) =>
                key === ATTRACTAP_KEYS.cardWriterMode ? current.mode : JSON.stringify(current.readerIds),
              ),
              setPlainSetting: jest.fn(async (parent: string, key: string, value: string) => {
                expect(parent).toBe(ATTRACTAP_PARENT);
                current =
                  key === ATTRACTAP_KEYS.cardWriterMode
                    ? { ...current, mode: value as CardWriterSettingsDto['mode'] }
                    : { ...current, readerIds: JSON.parse(value) };
              }),
            },
          },
          { provide: AttractapService, useValue: { getPairedReaders: jest.fn(async () => [{ id: 2 }, { id: 5 }]) } },
          { provide: AUDIT_RECORDER, useValue: { record } },
          { provide: LicenseService, useValue: {} },
        ],
      }).compile();
      controller = moduleRef.get(CardWriterSettingsController);
    });

    it('records the old and new mode and reader list', async () => {
      await controller.update({ mode: 'selected', readerIds: [2, 5] }, req);
      const events = record.mock.calls.map(([event]) => event);
      expect(events).toEqual([
        expect.objectContaining({
          domain: 'administration',
          action: 'settings.updated',
          actor: { id: 42, authenticationMethod: 'session' },
          subject: expect.objectContaining({ type: 'setting' }),
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
      expect(record).not.toHaveBeenCalled();
    });

    it('records the removal of a reader whose pairing was revoked', async () => {
      // Reader 3 was selected, then its pairing was revoked: GET no longer shows it, the stored setting still does.
      current = { mode: 'selected', readerIds: [2, 3, 5] };
      await controller.update({ mode: 'selected', readerIds: [2, 5] }, req);
      expect(record.mock.calls.map(([event]) => event.details)).toEqual([
        { settingKey: 'attractap.cardWriterReaders', before: '2,3,5', after: '2,5' },
      ]);
    });

    it('still returns the saved setting when the audit record is dropped', async () => {
      record.mockResolvedValueOnce({ status: 'unavailable' });
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
