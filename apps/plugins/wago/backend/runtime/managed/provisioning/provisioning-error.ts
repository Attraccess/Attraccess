const reasons = {
  tools: 'Required FW31 account tools are unavailable. Check that passwd, useradd, groupadd and sudo are installed.',
  accounts:
    'Local account lookup is unsupported. FW31 must use local files for passwd and group in /etc/nsswitch.conf.',
  policy:
    'The sudo policy does not allow the scoped management helper. Check /etc/sudoers and its /etc/sudoers.d include.',
  peer: 'Unsupported SSH server. Managed access requires FW31 Dropbear 2025.88.',
  filesystem:
    'Management paths have unsafe ownership, permissions or an active installation lock. Finish cleanup before retrying.',
  account:
    'The dedicated management account could not be created or verified. Check for an existing unowned attraccess account.',
  key: 'The management public key could not be installed. Check ownership and permissions of /home/attraccess/.ssh.',
  helper:
    'The management helper or recovery boot hooks could not be installed. Check free storage and root-owned system paths.',
  password: 'The generated recovery password could not be applied using FW31 passwd. Check the local account database.',
  proof: 'The new management SSH key could not be verified. Check SSH access on port 22 and the scoped sudo policy.',
  root: 'The generated root recovery login could not be verified. Check root password SSH access on port 22.',
  commit: 'The verified management key could not be committed. Check controller connectivity and retry after cleanup.',
} as const;

export type ManagedProvisioningStage = keyof typeof reasons;

/** Only fixed stage IDs cross the SSH boundary; raw output can contain credentials. */
export class WagoManagedProvisioningError extends Error {
  constructor(readonly stage: ManagedProvisioningStage) {
    super(`Managed SSH setup failed (${stage}). ${reasons[stage]}`);
  }
}

export function managedProvisioningError(output: string): WagoManagedProvisioningError | null {
  const stage = output
    .split('\n')
    .find((line) => /^WAGO_MANAGEMENT_FAILURE=[a-z]+$/.test(line))
    ?.split('=')[1];
  return stage && Object.hasOwn(reasons, stage)
    ? new WagoManagedProvisioningError(stage as ManagedProvisioningStage)
    : null;
}
