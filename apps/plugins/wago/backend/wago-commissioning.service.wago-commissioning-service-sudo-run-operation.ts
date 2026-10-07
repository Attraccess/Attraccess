import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { SshRunLimits } from "./wago-commissioning.service.ssh-run-limits";
import { shellQuote } from "./wago-commissioning.service.shell-quote";
import { WagoCommissioningServiceInspectOperation } from "./wago-commissioning.service.wago-commissioning-service-inspect-operation";
export abstract class WagoCommissioningServiceSudoRunOperation extends WagoCommissioningServiceInspectOperation {


  protected sudoRun(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
    limits?: SshRunLimits,
  ): Promise<string> {
    if (credential.username === 'root') return this.run(host, fingerprint, credential, command, input, limits);
    return this.run(
      host,
      fingerprint,
      credential,
      `sudo -S sh -c ${shellQuote(command)}`,
      `${credential.password}\n${input ?? ''}`,
      limits,
    );
  }
}
