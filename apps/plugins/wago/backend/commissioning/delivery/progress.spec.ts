import { CommissioningProgressReader, commissioningCommandTimeout, WagoCommissioningTimeoutError } from './progress';

it('bounds each command by the remaining operation budget and reserves failure-persistence time', () => {
  expect(commissioningCommandTimeout(1_800_000, 180_000, 0)).toBe(120_000);
  expect(commissioningCommandTimeout(15_000, 180_000, 0)).toBe(15_000);
  expect(() => commissioningCommandTimeout(15_000, 60_000, 0)).toThrow(WagoCommissioningTimeoutError);
});

it('reports complete known checkpoints across SSH chunk boundaries', () => {
  const report = jest.fn();
  const reader = new CommissioningProgressReader(report);
  reader.write('WAGO_PROG');
  expect(report).not.toHaveBeenCalled();
  reader.write('RESS=preparation-io\nWAGO_PROGRESS=preparation-ready\n');
  expect(report.mock.calls).toEqual([['preparation-io'], ['preparation-ready']]);
});

it('rejects arbitrary output, unknown stages, and oversized partial lines', () => {
  const report = jest.fn();
  const reader = new CommissioningProgressReader(report);
  reader.write('private-value WAGO_PROGRESS=preparation-io\nWAGO_PROGRESS=unknown\n');
  reader.write('x'.repeat(5000) + 'WAGO_PROGRESS=preparation-io\n');
  expect(report).not.toHaveBeenCalled();
  reader.write('WAGO_PROGRESS=preparation-final\n');
  expect(report).toHaveBeenCalledWith('preparation-final');
});
