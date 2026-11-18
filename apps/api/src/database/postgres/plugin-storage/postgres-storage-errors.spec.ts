import { postgresPluginErrorClassifier, postgresSqlState } from './postgres-storage-errors';

describe('postgres plugin storage errors', () => {
  it.each([
    ['23505', 'unique-violation'],
    ['23503', 'foreign-key-violation'],
    ['40001', 'conflict'],
    ['40P01', 'conflict'],
    ['55P03', 'busy'],
    ['57014', 'busy'],
    ['25006', 'read-only'],
  ])('classifies SQLSTATE %s as %s, from a raw and a wrapped driver error', (code, kind) => {
    expect(postgresPluginErrorClassifier.classify({ code })).toBe(kind);
    expect(postgresPluginErrorClassifier.classify({ driverError: { code } })).toBe(kind);
  });

  it('does not classify other states or non-errors', () => {
    expect(postgresPluginErrorClassifier.classify({ code: '42P01' })).toBeUndefined();
    expect(postgresPluginErrorClassifier.classify({ code: 'ECONNREFUSED' })).toBeUndefined();
    expect(postgresPluginErrorClassifier.classify(new Error('boom'))).toBeUndefined();
    expect(postgresPluginErrorClassifier.classify(undefined)).toBeUndefined();
    expect(postgresPluginErrorClassifier.classify(null)).toBeUndefined();
  });

  it('reads the SQLSTATE as the diagnostic code', () => {
    expect(postgresPluginErrorClassifier.diagnosticCode?.({ driverError: { code: '23505' } })).toBe('23505');
    expect(postgresSqlState({ driverError: { code: 12345 }, code: '40001' })).toBe('40001');
    expect(postgresSqlState({ code: 'toolong' })).toBeUndefined();
  });
});
