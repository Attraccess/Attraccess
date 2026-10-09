import { RuntimeUpdateError } from '../update/coordinator';
import { WagoRecoveryError } from '../recovery-error';

const reasons = {
  status:
    'The saved SSH setup state could not be checked. Check controller connectivity and retry update access setup.',
  audit: 'The server could not record the setup audit entry. Check server audit logging before retrying.',
  ownership:
    'The installation ownership records are missing or another operation owns the controller. Check the saved commissioning session.',
  proof: 'The update access key could not be verified. Check SSH connectivity and the restricted management account.',
  recovery_login:
    'The recovery login could not be verified before changing SSH access. Check the controller SSH service and recovery credentials.',
  key_commit:
    'The update access key could not be confirmed on the controller. Another installation or supervisor check may still be running. Keep the controller connected and retry update access setup.',
  acceptance:
    'The installed runtime and controller preparation could not be confirmed. Check the controller installation logs and retained transaction records before retrying.',
  cutover:
    'The controller could not apply secure SSH access. Automatic rollback restores the previous SSH settings unless the change was confirmed.',
  policy:
    'The running SSH service does not match the required secure access settings. Check the Dropbear startup configuration.',
  root_login: 'Root SSH login is still enabled. Check the Dropbear access restrictions before retrying.',
  boot: 'The controller did not report a valid boot identity. Check access to its Linux boot information.',
  reboot:
    'Secure SSH access could not be verified after reboot. Check power, network access and the Dropbear startup configuration. Automatic rollback restores unconfirmed SSH changes.',
  confirmation:
    'The server could not confirm secure update access. Check controller connectivity and server audit logging, then retry update access setup.',
  rollback:
    'The unconfirmed SSH change could not be rolled back. An administrator must check the controller rollback script and restore SSH access before retrying secure update setup.',
} as const;

export type ManagedSetupStage = keyof typeof reasons;

/** Fixed diagnostics only: subprocess output and credentials never enter public status. */
export function managedSetupFailure(stage: ManagedSetupStage, error: unknown, timedOut: boolean): string {
  let reason: string = reasons[stage];
  if (timedOut && stage === 'rollback') reason = reasons.rollback;
  else if (timedOut && ['status', 'proof', 'recovery_login', 'key_commit', 'acceptance', 'cutover'].includes(stage))
    reason =
      'Preparation exceeded its time limit while waiting for controller operations. Keep the controller connected, check the runtime supervisor and installation logs, then retry update access setup.';
  else if (timedOut)
    reason =
      'Secure SSH setup exceeded its verification time limit. Keep the controller connected and check SSH connectivity and startup logs. Automatic rollback restores unconfirmed SSH changes.';
  else if (error instanceof WagoRecoveryError && error.stage === 'busy')
    reason =
      'The runtime supervisor or another operation did not release the installation lock within 310 seconds. Keep the controller connected, check the supervisor and installation logs, then retry update access setup.';
  else if (error instanceof WagoRecoveryError && ['ownership', 'filesystem'].includes(error.stage))
    reason =
      'The installation records have missing ownership, unsafe permissions or conflicting transactions. Keep the records and have an administrator check the saved commissioning session and controller paths before retrying.';
  else if (error instanceof RuntimeUpdateError) {
    if (error.failure === 'authentication')
      reason = 'The controller rejected its saved update access key. Use Recovery tools to repair access.';
    else if (error.failure === 'host_identity')
      reason =
        'The SSH host key differs from the registered controller. Verify the controller identity and saved IP address before retrying.';
    else if (error.failure === 'ssh_agent')
      reason =
        'The server could not start its SSH authentication agent. Check that ssh-agent and ssh-add are available to the server process.';
    else if (error.failure === 'management_required')
      reason =
        'The saved update credentials could not be read. Check the server encryption settings and use Recovery tools to repair access.';
    else if (error.failure === 'offline')
      reason =
        'The SSH command for this setup step failed or lost its connection. Check controller connectivity and installation logs, then retry update access setup.';
    else if (error.failure === 'lock_tools')
      reason =
        'The installed SSH management scripts use a lock option unsupported by this CC100 firmware. An administrator must repair the scripts through the controller console or restore root SSH access before automatic setup can continue.';
    else if (error.failure === 'storage')
      reason =
        'The controller has insufficient free storage to finish setup. Free storage on the controller, then retry update access setup.';
  }
  return `Automatic SSH setup failed (${stage}). ${reason}`;
}
