/** Only known diagnostics cross the credential-bearing process boundary, never raw output or argv. */
const controllerDiagnostics: Record<string, string> = {
  'unsupported-firmware': 'The controller is not a supported CC100 751-9301 running firmware 31.',
  'missing-register': 'The required onboard digital input or output register is missing.',
  'uid10001-access-denied': 'Runtime UID 10001 cannot access the required digital registers after preparation.',
  'permission-tool-unavailable': 'The controller has no working setpriv/capsh tool for verifying runtime permissions.',
  'codesys-active': 'CODESYS is still running after the stop command.',
  'codesys-boot-enabled': 'CODESYS is still enabled at boot after preparation.',
  'codesys-stop-failed': 'The WAGO runtime stop command failed; CODESYS could not be stopped.',
  'codesys-disable-failed': 'The WAGO config_runtime command failed to disable CODESYS permanently.',
  'output-container-conflict': 'Another Docker container has access to the onboard outputs.',
  'output-host-process-conflict': 'Another host process has the onboard output register open.',
  'host-io-observation-failed': 'The controller could not verify exclusive ownership of the onboard outputs.',
  'runtime-identity-conflict': 'A host account or group already uses runtime identity 10001.',
  'runtime-userns-unsupported':
    'Docker rootless mode or user-namespace remapping prevents the required register access.',
  'docker-install-failed': 'The firmware config_docker install command failed.',
  'docker-activation-failed': 'The firmware config_docker activate command failed.',
  'docker-start-timeout': 'The vendor Docker daemon did not become reachable on /var/run/docker.sock.',
  'docker-boot-not-enabled': 'The vendor Docker boot service was not enabled by activation.',
  'docker-boot-unverified': 'The Docker boot entry does not point to the vendor dockerd service.',
  'docker-activation-unverified': 'The vendor tool did not report Docker as active after activation.',
  'unsupported-fw31-package-activation':
    'The firmware-installed Docker package cannot be activated with the available vendor tools.',
  'unsupported-tool-state': 'The vendor Docker tools returned an unsupported installation state.',
  'bounded-vendor-command-unavailable':
    'The controller is missing timeout, required to bound vendor lifecycle commands.',
  'io-ownership-failed': 'The controller refused the required digital-register ownership change.',
  'io-permission-failed': 'The controller refused the required digital-register permission change.',
  'io-permission-unverified': 'The digital-register permissions did not match after preparation.',
  'vendor-package-missing: unsupported-fw31-package-activation':
    'The firmware-installed docker/dockerd binaries are missing.',
  'Runtime requires GNU tar': 'The controller tar command is not GNU tar, which the runtime installer requires.',
  'Docker storage inspection failed': 'Docker did not return its storage directory on the local socket.',
};

const fixedShellDiagnostics = [
  'Runtime supervisor launch unverified: prerequisites',
  'Runtime supervisor launch unverified: readiness',
  'Runtime supervisor launch unverified: owner-verification',
  'Runtime supervisor handoff lock unverified; recovery required',
  'Runtime supervisor launch unverified',
  'Cleanup incomplete; recovery journal retained',
  'Unsupported firmware Docker version',
  'Unsupported Docker boot medium',
  'Cannot verify Docker boot medium',
  'Cannot verify CODESYS stopped',
  'Cannot inspect Docker workloads',
  'Cannot inspect Docker workload',
  'Cannot verify previous runtime containment',
  'Docker provisioning token mismatch',
  'Runtime transaction exists; recover or accept it before retrying',
  'No started runtime transaction to accept',
  'Runtime container is not running',
  'Delivery journal exists; explicit recovery required',
  'Recovery or acceptance required before delivery',
  'Another runtime transaction holds the controller lock',
  'Unsafe controller lock ownership, permissions or file type',
  'Unsafe runtime configuration ownership or permissions',
  'Unsafe configuration parent ownership or permissions',
  'Invalid Docker storage root',
  'Cannot identify storage filesystem',
  'Invalid storage filesystem identity',
  'Controller preparation required',
  'Incomplete runtime upload',
  'Runtime upload checksum mismatch',
  'Runtime image stream or Docker load failed',
  'Runtime image archive is missing',
  'Invalid runtime image archive members',
  'Unsafe runtime upload parent',
  'Unsafe runtime upload directory',
  'Runtime upload staging already exists; cleanup required',
  'Runtime image reference mismatch',
  'Runtime lock is busy',
  'Retained runtime installation requires cleanup',
];

const runtimeTools =
  'flock|docker|dockerd|timeout|sha256sum|base64|tar|grep|awk|stat|dd|df|nohup|mktemp|cat|cp|mv|chmod|chown|rm|mkdir|touch|wc|tr|sed|bash|sudo|chpasswd';

export function controllerFailureDetail(stderr: string): string | undefined {
  const lines = stderr.slice(-8192).split(/\r?\n/);
  for (const line of lines) {
    if (Object.hasOwn(controllerDiagnostics, line)) return controllerDiagnostics[line];
    if (fixedShellDiagnostics.includes(line)) return line;
    const tool = new RegExp(`^Runtime tool unavailable: (${runtimeTools})$`).exec(line);
    if (tool) return `Required controller command is missing: ${tool[1]}.`;
    const storage =
      /^Insufficient runtime storage: (\/(?:tmp|etc(?:\/attraccess-wago)?|var\/lib(?:\/docker)?)) requires ([0-9]{1,12}) KiB, available ([0-9]{1,12}) KiB$/.exec(
        line,
      );
    if (storage)
      return `Insufficient runtime storage on ${storage[1]}: requires ${storage[2]} KiB, available ${storage[3]} KiB.`;
    // A custom Docker storage path is not echoed back from untrusted output.
    const dockerStorage =
      /^Insufficient runtime storage: \/[^\r\n]{1,256} requires ([0-9]{1,12}) KiB, available ([0-9]{1,12}) KiB$/.exec(
        line,
      );
    if (dockerStorage)
      return `Insufficient runtime storage: requires ${dockerStorage[1]} KiB, available ${dockerStorage[2]} KiB.`;
  }
  return undefined;
}

export type ProcessTermination =
  'remote-exit' | 'local-timeout' | 'operation-aborted' | 'output-limit' | 'spawn-failed';

export class WagoCommissioningProcessError extends Error {
  readonly diagnostic?: string;
  constructor(
    command: string,
    readonly exitCode: number | null,
    elapsedMs: number,
    stderr: string,
    readonly termination: ProcessTermination = 'remote-exit',
    spawnCode?: string,
  ) {
    let detail: string | undefined;
    const output = stderr.slice(-8192);
    if (termination === 'spawn-failed') {
      detail =
        spawnCode === 'ENOENT'
          ? `Required API-host command is missing: ${command}. Install the OpenSSH client tools on the Attraccess server.`
          : spawnCode === 'EACCES'
            ? `The API host cannot execute ${command}: permission denied.`
            : `The API host could not start ${command}.`;
    } else if (termination === 'local-timeout') detail = 'The operation exceeded its time limit.';
    else if (termination === 'operation-aborted')
      detail = 'The commissioning operation was cancelled or lost its lease.';
    else if (termination === 'output-limit') detail = 'The controller exceeded the diagnostic output limit.';
    else {
      detail = controllerFailureDetail(output);
      if (
        !detail &&
        /Permission denied \((?:publickey|password|keyboard-interactive)(?:,(?:publickey|password|keyboard-interactive))*\)/.test(
          output,
        )
      )
        detail = 'SSH authentication rejected. Supply a valid custom SSH credential for this controller.';
      else if (!detail && /(?:Sorry, try again|incorrect password attempt|sudo: a password is required)/.test(output))
        detail = 'SSH login succeeded, but sudo rejected the password.';
      else if (!detail && /(?:not in the sudoers file|not allowed to execute|not allowed to run sudo)/.test(output))
        detail = 'SSH login succeeded, but this account is not permitted to run commissioning commands with sudo.';
      else if (!detail && /(?:sudo:.*(?:must have a tty|terminal is required))/.test(output))
        detail =
          'The controller sudo policy requires an interactive terminal; commissioning requires non-interactive sudo.';
      else if (!detail && /(?:REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed)/.test(output))
        detail = 'The SSH host key does not match the pinned controller identity.';
      else if (!detail && /Connection refused/.test(output))
        detail = 'The controller refused the SSH connection on port 22.';
      else if (!detail && /(?:Connection timed out|Operation timed out)/.test(output))
        detail = 'The SSH connection to the controller timed out.';
      else if (!detail && /(?:No route to host|Network is unreachable)/.test(output))
        detail = 'The API host has no network route to the controller.';
      else if (!detail && /Could not resolve hostname/.test(output))
        detail = 'The API host could not resolve the controller hostname.';
      else if (!detail && /(?:Connection reset|Connection closed|Broken pipe)/.test(output))
        detail = 'The SSH connection was interrupted; remote completion is unverified.';
      if (!detail) {
        const missing = new RegExp(
          `(?:^|\\n)(?:[^\\n]*: )?(${runtimeTools}): (?:command )?not found(?:\\r?\\n|$)`,
        ).exec(output);
        if (missing) detail = `Required controller command is missing: ${missing[1]}.`;
      }
      if (!detail && command === 'ssh-keyscan')
        detail = 'The SSH host-key scan failed before authentication; the controller identity could not be verified.';
    }
    super(
      `${detail ?? 'The command failed without a recognized diagnostic.'} (${command}, ${termination}, exit ${exitCode ?? 'unknown'}, ${Math.round(elapsedMs / 1000)}s elapsed)`,
    );
    this.diagnostic = detail;
  }
}

const safeLocalErrors = new Set([
  'the controller did not provide an Ed25519 SSH host key',
  'controller SSH host key changed after automatic identity verification',
  'the controller did not provide a supported SSH host key',
  'Clean up the retained runtime installation before preparing the controller.',
  'Clean up the retained controller preparation before retrying.',
  'Verified runtime release does not match the session-pinned artifact.',
  'Runtime artifact checksum does not match',
  'Invalid signed runtime artifact',
  'Artifact changed during snapshot acquisition',
  'Invalid hardware deployment report',
  'Restricted credential unavailable',
  'Broker unavailable',
  'Broker changed during delivery',
  'Invalid environment value',
  'Secure SSH credential storage is unavailable.',
  'Invalid controller clock observation.',
  'Unsupported FW31 clock tool; clock was not changed.',
  'Controller clock skew exceeds the supported ten-year bound.',
  'Clock correction authorization sample expired.',
  'Application clock changed or controller clock observation expired.',
  'Application clock changed or clock verification expired before enrollment.',
  'Controller clock correction postcondition failed; enrollment is blocked.',
]);

/**
 * The RabbitMQ credential provider deliberately turns every upstream failure
 * into one of these messages. Keep that useful operator context at the
 * commissioning boundary, but never pass through arbitrary provider output:
 * it may include a request body, a username, or a credential.
 */
function safeMqttCredentialProvisioningFailure(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const { message } = error;

  if (message.startsWith('Cannot reach the RabbitMQ management API at ')) {
    const separator = ': ';
    const detail = message.slice(message.indexOf(separator) + separator.length);
    const allowedDetails = new Set([
      'Management API did not respond within 10000ms.',
      'Management API response exceeded the 8 MiB limit.',
      'Management API returned an invalid HTTP status.',
      'Management connection refused. Check the management listener and port.',
      'Management hostname could not be resolved. Check DNS and the configured host.',
      'Failed to reach the RabbitMQ management API. Check connectivity and, for HTTPS, the CA, certificate validity, host clock, and TLS server name.',
    ]);
    if (allowedDetails.has(detail)) return `RabbitMQ management API is unreachable: ${detail}`;
    // Older installed RabbitMQ plugin packages returned Node's raw refusal
    // text. Reduce that legacy form to the same safe, useful diagnostic.
    if (/^connect ECONNREFUSED (?:\[[^\]\r\n]{1,256}\]|[^\s\r\n:]{1,253}):[0-9]{1,5}$/.test(detail))
      return 'RabbitMQ management API is unreachable: Management connection refused. Check the management listener and port.';
    if (
      /^TLS certificate is (?:expired or not yet valid|not trusted)\./.test(detail) ||
      detail.startsWith('TLS certificate hostname mismatch.') ||
      detail.startsWith('RabbitMQ management requires certificate verification.') ||
      detail.startsWith('TLS server name must be a DNS hostname') ||
      detail.startsWith('Invalid CA certificate.')
    )
      return `RabbitMQ management API connection failed: ${detail}`;
  }

  if (
    message === 'The RabbitMQ management API rejected the configured MQTT server credentials (401). Check the username/password configured for this MQTT server.' ||
    message ===
      'The configured MQTT server user lacks management privileges on RabbitMQ. User management requires a user with the "administrator" tag.' ||
    message === 'Not found on the RabbitMQ side.' ||
    message === 'RabbitMQ rejected the request.' ||
    message === 'The RabbitMQ management API returned a response that is not valid JSON.'
  )
    return message;
  if (/^RabbitMQ management API request failed \(HTTP [1-5][0-9]{2}\)\.$/.test(message)) return message;
  return undefined;
}

export function commissioningFailure(error: unknown, stage: string): string {
  if (error instanceof WagoCommissioningProcessError || (error instanceof Error && safeLocalErrors.has(error.message)))
    return `${stage}: ${error.message}`;
  const mqttFailure = safeMqttCredentialProvisioningFailure(error);
  if (mqttFailure) return `${stage}: ${mqttFailure}`;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const local: Record<string, string> = {
    ENOENT: 'A required file or directory is missing on the API host.',
    EACCES: 'The API host was denied access to a required file or directory.',
    ENOSPC: 'The API host has insufficient free storage to stage the signed runtime.',
    EROFS: 'The API runtime storage is on a read-only filesystem.',
  };
  if (code && Object.hasOwn(local, code)) return `${stage}: ${local[code]} (${code})`;
  return `${stage}: the operation failed without a recognized diagnostic.`;
}
