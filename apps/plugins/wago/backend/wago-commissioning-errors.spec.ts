import {
  commissioningFailure,
  controllerFailureDetail,
  WagoCommissioningProcessError,
} from './wago-commissioning-errors';

describe('credential-safe commissioning diagnostics', () => {
  it.each([
    ['Runtime tool unavailable: flock\n', 'Required controller command is missing: flock'],
    ['codesys-disable-failed\n', 'config_runtime command failed'],
    ['Runtime requires GNU tar\n', 'not GNU tar'],
    [
      'Insufficient runtime storage: /etc/attraccess-wago requires 247506 KiB, available 181188 KiB\n',
      'requires 247506 KiB, available 181188 KiB',
    ],
    ['output-host-process-conflict\n', 'Another host process'],
    ['Docker provisioning token mismatch\n', 'Docker provisioning token mismatch'],
  ])('retains a recognized shell failure (%s) without exposing neighboring output', (line, expected) => {
    const error = new WagoCommissioningProcessError('ssh', 1, 2100, `secret\n${line}secret\n`);
    expect(error.message).toContain(expected);
    expect(error.message).toContain('exit 1, 2s elapsed');
    expect(JSON.stringify(error)).not.toContain('secret');
  });

  it('does not promote arbitrary remote output or substrings to operator diagnostics', () => {
    const output = 'secret: codesys-disable-failed\nRuntime tool unavailable: private-secret\n';
    expect(controllerFailureDetail(output)).toBeUndefined();
    expect(new WagoCommissioningProcessError('ssh', 1, 0, output).message).toContain('without a recognized diagnostic');
    expect(commissioningFailure(new Error('private-secret'), 'Preparing controller')).not.toContain('private-secret');
  });

  it('retains only vetted RabbitMQ provisioning diagnostics', () => {
    const failure = commissioningFailure(
      new Error(
        'The RabbitMQ management API rejected the configured MQTT server credentials (401). Check the username/password configured for this MQTT server.',
      ),
      'Issuing MQTT enrollment',
    );
    expect(failure).toContain('rejected the configured MQTT server credentials');
    expect(
      commissioningFailure(
        new Error('Cannot reach the RabbitMQ management API at http://untrusted.example:15672: private-secret'),
        'Issuing MQTT enrollment',
      ),
    ).not.toContain('private-secret');
    expect(
      commissioningFailure(
        new Error('Cannot reach the RabbitMQ management API at http://broker.example:15672: connect ECONNREFUSED 192.0.2.1:15672'),
        'Issuing MQTT enrollment',
      ),
    ).toContain('Management connection refused');
  });

  it.each([
    ['spawn-failed', 'ENOENT', 'Required API-host command is missing: ssh'],
    ['spawn-failed', 'EACCES', 'API host cannot execute ssh'],
    ['local-timeout', undefined, 'exceeded its time limit'],
    ['operation-aborted', undefined, 'cancelled or lost its lease'],
    ['output-limit', undefined, 'exceeded the diagnostic output limit'],
  ] as const)('distinguishes %s (%s)', (termination, code, expected) => {
    expect(new WagoCommissioningProcessError('ssh', null, 0, 'private-secret', termination, code).message).toContain(
      expected,
    );
  });
});
