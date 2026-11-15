import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ResourceHoursSummaryRow, useResourceHoursSummaryColumns } from '.';

vi.mock('@attraccess/react-query-client', () => ({
  CsvExportType: { RESOURCE_HOURS_SUMMARY: 'resourceHoursSummary' },
  useAnalyticsServiceGetResourceHoursSummaryInDateRangeInfinite: vi.fn(),
}));

const HOUR = 3_600_000;
const row = (overrides: Partial<ResourceHoursSummaryRow> = {}): ResourceHoursSummaryRow => ({
  id: 1,
  resourceId: 1,
  resourceName: 'Laser',
  metadata: { costCenter: '4711' },
  sessionCount: 2,
  personDurationMs: 4 * HOUR,
  sessionDurationMs: 3 * HOUR,
  operatingDataAvailable: true,
  operatingDurationMs: 2.5 * HOUR,
  unattributedOperatingDurationMs: 0.5 * HOUR,
  isProvisional: false,
  ...overrides,
});

const valuesOf = (item: ResourceHoursSummaryRow) => {
  const { result } = renderHook(() => useResourceHoursSummaryColumns([item]));
  return Object.fromEntries(result.current.map((field) => [field.key, field.getter(item)]));
};

it('keeps the persisted column keys stable and selects the documented defaults', () => {
  const { result } = renderHook(() => useResourceHoursSummaryColumns([row()]));

  expect(result.current.map((field) => field.key)).toEqual([
    'resourceId',
    'resourceName',
    'sessions',
    'personHours',
    'machineHours',
    'machineRunningHours',
    'outsideSessionHours',
    'durationStatus',
    'resourceMetadata.costCenter',
  ]);
  expect(result.current.filter((field) => field.selectedByDefault).map((field) => field.key)).toEqual([
    'resourceId',
    'resourceName',
    'sessions',
    'personHours',
    'machineHours',
    'machineRunningHours',
    'durationStatus',
  ]);
});

it('writes person and machine hours separately, converted from milliseconds', () => {
  expect(valuesOf(row())).toMatchObject({
    sessions: 2,
    personHours: '4',
    machineHours: '3',
    machineRunningHours: '2.5',
    outsideSessionHours: '0.5',
    durationStatus: '',
  });
});

it('leaves the running-time columns empty and flags the status without operating data', () => {
  expect(
    valuesOf(
      row({
        operatingDataAvailable: false,
        operatingDurationMs: null,
        unattributedOperatingDurationMs: null,
        isProvisional: true,
      }),
    ),
  ).toMatchObject({
    machineRunningHours: '',
    outsideSessionHours: '',
    durationStatus: 'Provisional; Unavailable',
  });
});
