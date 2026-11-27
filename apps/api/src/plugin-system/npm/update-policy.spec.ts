import { DEFAULT_PLUGIN_UPDATE_POLICY, patchUpdatePolicy, readStoredUpdatePolicy } from './update-policy';

const SCHEDULE = { weekdays: [1, 2], startMinute: 120, durationMinutes: 90, timeZone: 'Europe/Berlin' };

describe('plugin update policy', () => {
  it('has automatic updates off and checks on by default', () => {
    expect(DEFAULT_PLUGIN_UPDATE_POLICY).toMatchObject({ checksEnabled: true, automaticUpdates: false, mode: 'minor' });
    for (const raw of [undefined, null, ''])
      expect(readStoredUpdatePolicy(raw)).toEqual({ policy: DEFAULT_PLUGIN_UPDATE_POLICY, legacy: false });
  });

  it('patches the schedule field by field and sorts the weekdays', () => {
    const saved = patchUpdatePolicy(DEFAULT_PLUGIN_UPDATE_POLICY, {
      schedule: { ...SCHEDULE, weekdays: [5, 1, 5] },
    });
    expect(saved.schedule.weekdays).toEqual([1, 5]);
    expect(patchUpdatePolicy(saved, { schedule: { startMinute: 0 } }).schedule).toEqual({
      ...SCHEDULE,
      weekdays: [1, 5],
      startMinute: 0,
    });
  });

  it('never lets anything but the switch allow installing', () => {
    const saved = patchUpdatePolicy(DEFAULT_PLUGIN_UPDATE_POLICY, { mode: 'follow', schedule: SCHEDULE });
    expect(saved.automaticUpdates).toBe(false);
  });

  it('reads back what it stored', () => {
    const saved = patchUpdatePolicy(DEFAULT_PLUGIN_UPDATE_POLICY, { automaticUpdates: true, schedule: SCHEDULE });
    expect(readStoredUpdatePolicy(JSON.stringify(saved))).toEqual({ policy: saved, legacy: false });
  });

  describe('a policy saved before automatic updates became opt-in', () => {
    const legacy = (patch: object) =>
      readStoredUpdatePolicy(
        JSON.stringify({
          checksEnabled: true,
          mode: 'follow',
          prerelease: true,
          maintenanceWindow: { startMinute: 60, durationMinutes: 30 },
          ...patch,
        }),
      );

    it('comes out switched off, with its window kept as an every-day UTC schedule', () => {
      expect(legacy({})).toEqual({
        legacy: true,
        policy: {
          checksEnabled: true,
          automaticUpdates: false,
          mode: 'follow',
          prerelease: true,
          schedule: { weekdays: [1, 2, 3, 4, 5, 6, 7], startMinute: 60, durationMinutes: 30, timeZone: 'UTC' },
        },
      });
    });

    it.each([true, false])('keeps checksEnabled %s', (checksEnabled) => {
      expect(legacy({ checksEnabled }).policy).toMatchObject({ checksEnabled, automaticUpdates: false });
    });

    it('turns the former mode off into the default step, still switched off', () => {
      expect(legacy({ mode: 'off' }).policy).toMatchObject({ mode: 'minor', automaticUpdates: false });
    });

    it('does without a window it cannot read', () => {
      expect(legacy({ maintenanceWindow: { startMinute: 9999 } }).policy.schedule).toEqual(
        DEFAULT_PLUGIN_UPDATE_POLICY.schedule,
      );
    });
  });

  it.each(['not json', '[]', '"text"', JSON.stringify({ automaticUpdates: true })])(
    'falls back to the switched-off default for unusable stored text %s',
    (raw) => {
      expect(readStoredUpdatePolicy(raw).policy).toEqual(DEFAULT_PLUGIN_UPDATE_POLICY);
    },
  );
});
