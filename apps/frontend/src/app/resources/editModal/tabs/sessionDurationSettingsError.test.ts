import { describe, expect, it } from 'vitest';
import { ResourceType } from '@attraccess/react-query-client';
import { sessionDurationSettingsError } from './sessionDurationSettingsError';

const machine = ResourceType.MACHINE;

describe('sessionDurationSettingsError', () => {
  it('accepts no maximum, a maximum up to 720 hours and a default estimate within it', () => {
    expect(sessionDurationSettingsError({ type: machine, maxSessionDurationMinutes: null })).toBeNull();
    expect(sessionDurationSettingsError({ type: machine, maxSessionDurationMinutes: 43_200 })).toBeNull();
    expect(
      sessionDurationSettingsError({
        type: machine,
        maxSessionDurationMinutes: 120,
        defaultSessionDurationEstimateMinutes: 120,
      }),
    ).toBeNull();
  });

  it('refuses a maximum above 720 hours', () => {
    expect(sessionDurationSettingsError({ type: machine, maxSessionDurationMinutes: 43_201 })).toBe(
      'inputs.machine.sessionDuration.maxSessionTime.tooLong',
    );
  });

  it('refuses a default estimate above the maximum', () => {
    expect(
      sessionDurationSettingsError({
        type: machine,
        maxSessionDurationMinutes: 60,
        defaultSessionDurationEstimateMinutes: 90,
      }),
    ).toBe('inputs.machine.sessionDuration.defaultEstimate.tooLong');
  });

  it('never blocks a door, which ignores these settings', () => {
    expect(
      sessionDurationSettingsError({
        type: ResourceType.DOOR,
        maxSessionDurationMinutes: 43_201,
        defaultSessionDurationEstimateMinutes: 50_000,
      }),
    ).toBeNull();
  });
});
