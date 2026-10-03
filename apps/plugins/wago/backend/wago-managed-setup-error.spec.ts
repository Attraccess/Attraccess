import { managedSetupFailure } from './wago-managed-setup-error';
import { RuntimeUpdateError } from './wago-runtime-update';

it('explains a preparation timeout without claiming SSH was already changed', () => {
  const message = managedSetupFailure('key_commit', new Error('private diagnostic'), true);
  expect(message).toContain('Automatic SSH setup failed (key_commit).');
  expect(message).toContain('waiting for controller operations');
  expect(message).not.toContain('rollback');
  expect(message).not.toContain('private diagnostic');
});

it.each([
  ['authentication', 'rejected its saved update access key'],
  ['host_identity', 'host key differs'],
  ['ssh_agent', 'ssh-agent and ssh-add'],
  ['lock_tools', 'lock option unsupported by this CC100 firmware'],
  ['management_required', 'encryption settings'],
] as const)('explains %s without exposing transport output', (failure, expected) => {
  const error = new RuntimeUpdateError(failure);
  error.message = 'transport output containing a private credential';
  const message = managedSetupFailure('proof', error, false);
  expect(message).toContain(expected);
  expect(message).not.toContain('private credential');
});
