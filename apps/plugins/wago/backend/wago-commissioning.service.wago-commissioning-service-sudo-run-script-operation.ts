import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { SshRunLimits } from "./wago-commissioning.service.ssh-run-limits";
import { WagoCommissioningServiceSudoRunOperation } from "./wago-commissioning.service.wago-commissioning-service-sudo-run-operation";
export abstract class WagoCommissioningServiceSudoRunScriptOperation extends WagoCommissioningServiceSudoRunOperation {


  protected sudoRunScript(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    script: string,
    limits?: SshRunLimits,
  ): Promise<string> {
    return this.sudoRun(
      host,
      fingerprint,
      credential,
      'base64 -d | sh',
      Buffer.from(script).toString('base64'),
      limits,
    );
  }
}
