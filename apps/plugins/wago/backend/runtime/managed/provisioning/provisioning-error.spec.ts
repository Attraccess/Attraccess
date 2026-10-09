import { managedProvisioningError } from './provisioning-error';

describe('managed SSH diagnostics', () => {
  it('retains the fixed stage and resolution without exposing raw remote output', () => {
    const error = managedProvisioningError('private credential\nWAGO_MANAGEMENT_FAILURE=tools\nprivate key\n');
    expect(error?.message).toContain('Check that passwd, useradd, groupadd and sudo are installed.');
    expect(error?.message).not.toContain('private');
  });

  it.each(['WAGO_MANAGEMENT_FAILURE=tools extra-secret', 'WAGO_MANAGEMENT_FAILURE=unknown', 'tools'])(
    'ignores unrecognized diagnostics: %s',
    (output) => expect(managedProvisioningError(output)).toBeNull(),
  );
});
