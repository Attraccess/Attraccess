import { classifyFailure, errorNames, type FailureContext } from './failure';
import { AlreadyCommissionedError, CommissioningCancelledError, sessionStepOf } from './flow';

const context = (overrides: Partial<FailureContext> = {}): FailureContext => ({
  step: null,
  cancelRequested: false,
  deadlineExpired: false,
  attestationFailed: false,
  attestationFindings: [],
  ...overrides,
});
const named = (name: string, options?: ErrorOptions) => {
  const error = new Error(`${name} message with 34970112332 in it`, options);
  Object.defineProperty(error.constructor, 'name', { value: name });
  return Object.assign(Object.create({ constructor: { name } }), {
    message: error.message,
    stack: error.stack,
    __proto__: undefined,
  });
};
// A real class per name: matter.js errors are matched by class name along the prototype chain.
const errorOf = (name: string, extra: Partial<Error> & { errors?: unknown[] } = {}) => {
  const holder = { [name]: class extends Error {} }[name];
  return Object.assign(new holder('boom'), extra);
};

describe('classifyFailure', () => {
  it.each([
    ['PasscodeMismatchError', 'pase_failed'],
    ['MaximumCommissionedFabricsReachedError', 'fabric_full'],
    ['CommissioningTimeoutError', 'timeout'],
    ['OperativeConnectionFailedError', 'case_failed'],
  ])('maps %s to %s', (name, code) => {
    expect(classifyFailure(errorOf(name), context())).toEqual({ code });
  });

  it('finds the cause inside an aggregate, as matter.js discovery reports it', () => {
    const aggregate = errorOf('DiscoveryAggregateError', { errors: [errorOf('PasscodeMismatchError')] });
    expect(errorNames(aggregate)).toEqual(expect.arrayContaining(['PasscodeMismatchError']));
    expect(classifyFailure(aggregate, context({ step: 'discovering' }))).toEqual({ code: 'pase_failed' });
  });

  it('maps the duplicate with its node ID, from the check and from the NOC status', () => {
    expect(classifyFailure(new AlreadyCommissionedError('7'), context())).toEqual({
      code: 'already_commissioned',
      existingNodeId: '7',
    });
    expect(classifyFailure(errorOf('DeviceAlreadyCommissionedToThisFabricError'), context())).toEqual({
      code: 'already_commissioned',
    });
    const wrapped = errorOf('CommissioningError', { cause: new AlreadyCommissionedError('9') });
    expect(classifyFailure(wrapped, context())).toMatchObject({ existingNodeId: '9' });
  });

  it('reports attestation findings by type', () => {
    expect(
      classifyFailure(errorOf('DeviceAttestationError'), context({ attestationFindings: ['PaaNotTrusted'] })),
    ).toEqual({ code: 'attestation_failed', attestationFindings: ['PaaNotTrusted'] });
    expect(classifyFailure(errorOf('CommissioningError'), context({ attestationFailed: true }))).toMatchObject({
      code: 'attestation_failed',
    });
  });

  it('tells cancel, deadline and a silent device apart', () => {
    expect(classifyFailure(new CommissioningCancelledError(), context({ cancelRequested: true }))).toEqual({
      code: 'cancelled',
    });
    expect(classifyFailure(errorOf('AbortedError'), context({ cancelRequested: true }))).toEqual({ code: 'cancelled' });
    expect(classifyFailure(errorOf('AbortedError'), context({ deadlineExpired: true }))).toEqual({ code: 'timeout' });
    expect(classifyFailure(errorOf('TimeoutError'), context({ step: 'discovering' }))).toEqual({
      code: 'device_not_found',
    });
  });

  it('reports a device that was seen on mDNS and then went silent as not found, not as an internal error', () => {
    const aggregate = errorOf('DiscoveryAggregateError', { errors: [errorOf('PeerCommunicationError')] });
    expect(classifyFailure(aggregate, context({ step: 'discovering' }))).toEqual({ code: 'device_not_found' });
    // After the pairing started the same errors are not a discovery problem.
    expect(classifyFailure(errorOf('PeerCommunicationError'), context({ step: 'adding_fabric' }))).toEqual({
      code: 'internal',
    });
  });

  it('falls back by step and never carries a message', () => {
    expect(classifyFailure(errorOf('Whatever'), context({ step: 'case' }))).toEqual({ code: 'case_failed' });
    expect(classifyFailure(errorOf('Whatever'), context({ step: 'pase' }))).toEqual({ code: 'pase_failed' });
    expect(classifyFailure(errorOf('Whatever'), context({ step: 'adding_fabric' }))).toEqual({ code: 'internal' });
    expect(JSON.stringify(classifyFailure(named('Whatever'), context()))).not.toContain('34970112332');
  });
});

describe('sessionStepOf', () => {
  it.each([
    ['GetInitialData', 'reading_device'],
    ['GeneralCommissioning.ArmFailsafe', 'reading_device'],
    ['OperationalCredentials.DeviceAttestation', 'attestation'],
    ['OperationalCredentials.Certificates', 'adding_fabric'],
    ['AccessControl', 'adding_fabric'],
    ['NetworkCommissioning.Wifi', 'network_setup'],
    ['Reconnect', 'case'],
    ['GeneralCommissioning.Complete', 'case'],
  ])('puts %s under %s', (name, step) => {
    expect(sessionStepOf(name)).toBe(step);
  });
});
