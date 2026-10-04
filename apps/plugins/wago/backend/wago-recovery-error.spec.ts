import { recoveryError } from './wago-recovery-error';

describe('safe installation cleanup diagnostics', () => {
  it.each([
    ['Another runtime transaction holds the controller lock\n', 'busy'],
    ['root@192.0.2.1: Permission denied (publickey,password).\n', 'authentication'],
    ['WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!\n', 'identity'],
    ['Runtime transaction belongs to another commissioning session\n', 'ownership'],
    ['Unsafe runtime journal ownership, permissions or file type\n', 'filesystem'],
    ['Recovery incomplete; journal retained for another recovery attempt\n', 'runtime'],
  ])('classifies %s without exposing raw output', (stderr, stage) => {
    expect(recoveryError(stderr).stage).toBe(stage);
    expect(recoveryError(`secret credential\n${stderr}`).message).not.toContain('secret credential');
  });

  it('does not echo unrecognized output or accept partial controller diagnostics', () => {
    const error = recoveryError('secret Another runtime transaction holds the controller lock');
    expect(error.stage).toBe('transport');
    expect(error.message).not.toContain('secret');
  });
});
