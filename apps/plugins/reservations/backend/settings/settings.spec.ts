import { Harness, createHarness, principal } from '../testing/harness.test-utils';
import { DEFAULT_SETTINGS, ResourceSettingsValues, validateSettings } from './settings.model';

const valid = (patch: Partial<ResourceSettingsValues> = {}): ResourceSettingsValues => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe('settings validation', () => {
  it('ships the defaults the requirements define', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      enabled: false,
      approvalRequired: false,
      timeStepMinutes: 15,
      minDurationMinutes: 15,
      maxDurationMinutes: 240,
      maxAdvanceDays: 30,
      minLeadMinutes: 0,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      maxActiveBookingsPerUser: 3,
      whoCanBook: 'can-start',
      confirmWindowMinutes: 60,
      checkInEnabled: true,
      checkInGraceMinutes: 15,
      earlyCheckInMinutes: 15,
      handoverReminderMinutes: 15,
      bookableHours: {},
    });
  });

  it('accepts the defaults', () => {
    expect(validateSettings(valid())).toEqual([]);
  });

  it.each([
    [{ timeStepMinutes: 7 }, 'timeStepMinutes'],
    [{ timeStepMinutes: 4 }, 'timeStepMinutes'],
    [{ minDurationMinutes: 20 }, 'minDurationMinutes'],
    [{ maxDurationMinutes: 100 }, 'maxDurationMinutes'],
    [{ minDurationMinutes: 60, maxDurationMinutes: 30 }, 'maxDurationMinutes'],
    [{ maxAdvanceDays: 0 }, 'maxAdvanceDays'],
    [{ minLeadMinutes: -1 }, 'minLeadMinutes'],
    [{ bufferBeforeMinutes: 1441 }, 'bufferBeforeMinutes'],
    [{ maxActiveBookingsPerUser: -1 }, 'maxActiveBookingsPerUser'],
    [{ confirmWindowMinutes: 1441 }, 'confirmWindowMinutes'],
    [{ checkInGraceMinutes: 0 }, 'checkInGraceMinutes'],
    [{ checkInGraceMinutes: 241 }, 'checkInGraceMinutes'],
    [{ earlyCheckInMinutes: 241 }, 'earlyCheckInMinutes'],
    [{ handoverReminderMinutes: 1.5 }, 'handoverReminderMinutes'],
    [{ whoCanBook: 'nobody' as never }, 'whoCanBook'],
    [{ bookableHours: { mon: [{ start: '10:00', end: '09:00' }] } }, 'bookableHours.mon'],
  ])('rejects %j', (patch, field) => {
    expect(validateSettings(valid(patch)).map((error) => error.field)).toContain(field);
  });

  it('accepts edge values', () => {
    expect(validateSettings(valid({ confirmWindowMinutes: 0 }))).toEqual([]);
    expect(
      validateSettings(valid({ confirmWindowMinutes: 1440, checkInGraceMinutes: 240, maxActiveBookingsPerUser: 0 })),
    ).toEqual([]);
  });
});

describe('settings services', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    h.makeManager(99, 1);
  });
  afterEach(() => h.close());

  it('warms the cache from the database and then serves reads without any query', async () => {
    await h.enable(1, { confirmWindowMinutes: 45 });
    await h.enable(2);
    await h.admin.update(principal(99), 1, { bufferAfterMinutes: 5 });
    h.settings.invalidate(1);
    h.settings.invalidate(2);
    await h.settings.warmUp();
    expect(h.settings.isWarm).toBe(true);
    const spy = jest.spyOn(h.dataSource, 'query');
    const manager = jest.spyOn(h.dataSource, 'getRepository');
    expect(h.settings.getCachedSettings(1)).toMatchObject({
      enabled: true,
      confirmWindowMinutes: 45,
      bufferAfterMinutes: 5,
    });
    expect(h.settings.getCachedSettings(2).enabled).toBe(true);
    expect(h.settings.getCachedSettings(404)).toMatchObject({ enabled: false, resourceId: 404 });
    expect(h.settings.getEnabledResourceIds().sort()).toEqual([1, 2]);
    expect(spy).not.toHaveBeenCalled();
    expect(manager).not.toHaveBeenCalled();
  });

  it('refreshes the cache on writes', async () => {
    await h.enable(1);
    expect(h.settings.getCachedSettings(1).enabled).toBe(true);
    await h.admin.update(principal(99), 1, { enabled: false });
    expect(h.settings.getCachedSettings(1).enabled).toBe(false);
  });

  it('persists bookable hours and normalises them', async () => {
    await h.admin.update(principal(99), 1, {
      bookableHours: {
        mon: [
          { start: '13:00', end: '17:00' },
          { start: '08:00', end: '12:00' },
        ],
        tue: [],
      },
    });
    const stored = await h.settings.get(1);
    expect(stored.bookableHours).toEqual({
      mon: [
        { start: '08:00', end: '12:00' },
        { start: '13:00', end: '17:00' },
      ],
    });
  });

  it('rejects invalid updates with field errors and keeps the old values', async () => {
    await expect(h.admin.update(principal(99), 1, { timeStepMinutes: 7 })).rejects.toMatchObject({
      code: 'INVALID_SETTINGS',
      response: { errors: [{ field: 'timeStepMinutes' }] },
    });
    expect((await h.settings.get(1)).timeStepMinutes).toBe(15);
  });

  it('only managers read or change settings', async () => {
    await expect(h.admin.getForManager(principal(10), 1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h.admin.update(principal(10), 1, { enabled: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h.admin.futureBookingsCount(principal(10), 1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h.admin.getForManager(principal(99), 2)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h.admin.getForManager(principal(99), 77)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    h.grant(50, 'resources.update');
    await expect(h.admin.getForManager(principal(50), 2)).resolves.toMatchObject({ resourceId: 2, enabled: false });
  });

  it('records settings_changed in the audit log', async () => {
    await h.admin.update(principal(99), 1, { enabled: true, approvalRequired: true });
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reservations.settings_changed',
        subject: { type: 'reservations.resource', id: 1 },
        details: expect.objectContaining({ changedFields: 'enabled,approvalRequired' }),
      }),
    );
  });

  it('stores and validates the global timezone', async () => {
    expect(await h.admin.getGlobal()).toMatchObject({ timezone: 'Europe/Berlin' });
    await expect(h.admin.setTimezone(principal(1), 'Nowhere/City')).rejects.toMatchObject({ code: 'INVALID_TIMEZONE' });
    expect(await h.admin.setTimezone(principal(1), 'America/New_York')).toMatchObject({ timezone: 'America/New_York' });
    expect(await h.globalSettings.getTimezone()).toBe('America/New_York');
  });
});
