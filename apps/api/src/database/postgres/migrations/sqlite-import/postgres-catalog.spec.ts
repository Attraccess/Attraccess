import { describePostgresError, isSecretColumn, quote } from './postgres-catalog';

describe('describePostgresError', () => {
  it('names the meaning, SQLSTATE, constraint and column of a driver error, never its message or detail', () => {
    const error = {
      message: 'null value in column "meterId" violates not-null constraint',
      driverError: { code: '23502', column: 'meterId', detail: 'Failing row contains (secret-hash)' },
    };
    expect(describePostgresError(error)).toBe('a required value is missing (SQLSTATE 23502), column meterId');
  });

  it('reads a plain pg error and names its constraint', () => {
    expect(describePostgresError({ code: '23514', constraint: 'CHK_status' })).toBe(
      'a check constraint is broken (SQLSTATE 23514), constraint CHK_status',
    );
  });

  it('keeps an unknown SQLSTATE as it is', () => {
    expect(describePostgresError({ code: '40P01' })).toBe('SQLSTATE 40P01');
  });

  it('copes with a failure that carries no code', () => {
    expect(describePostgresError(new Error('boom'))).toBe('SQLSTATE unknown');
    expect(describePostgresError(undefined)).toBe('SQLSTATE unknown');
  });
});

describe('isSecretColumn', () => {
  it.each(['tokenHash', 'passwordResetToken', 'clientSecret', 'key'])('treats %s as credential material', (column) => {
    expect(isSecretColumn(column)).toBe(true);
  });

  it.each(['id', 'userId', 'keyNo', 'resourceId'])('prints %s', (column) => {
    expect(isSecretColumn(column)).toBe(false);
  });
});

describe('quote', () => {
  it('quotes an identifier and doubles embedded quotes', () => {
    expect(quote('user')).toBe('"user"');
    expect(quote('we"ird')).toBe('"we""ird"');
  });
});
