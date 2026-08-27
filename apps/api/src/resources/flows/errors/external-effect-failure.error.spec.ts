import { ExternalEffectFailureError } from './external-effect-failure.error';

describe('ExternalEffectFailureError', () => {
  it.each(['transport-dispatch', 'acknowledgement-timeout', 'controller-rejection', 'node-failure'] as const)(
    'exposes %s in the user-facing response',
    (failureKind) => {
      const error = new ExternalEffectFailureError('External controller failed', new Error('cause'), failureKind);

      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toEqual({
        statusCode: 503,
        error: 'External effect failed',
        message: 'External controller failed',
        failureKind,
      });
    },
  );
});
