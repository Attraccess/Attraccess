import { wagoFw31IdentityRead } from './wago-firmware-identity';
import { parseWagoCodesysClassification, wagoCodesysClassificationShell } from './wago-codesys-classification';
import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { WagoCommissioningServiceClaimDiscoveredOperation } from "./wago-commissioning.service.wago-commissioning-service-claim-discovered-operation";
export abstract class WagoCommissioningServiceInspectOperation extends WagoCommissioningServiceClaimDiscoveredOperation {


  protected async inspect(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
  ): Promise<{ firmware: string; codesys: string }> {
    const output = await this.sudoRunScript(
      host,
      fingerprint,
      credential,
      `${wagoFw31IdentityRead()}; root=''; ${wagoCodesysClassificationShell()}\nprintf '\\nCODESYS='; wago_codesys_classify`,
    );
    const marker = '\nCODESYS=';
    const markerIndex = output.indexOf(marker);
    const firmware = markerIndex >= 0 ? output.slice(0, markerIndex) : output;
    const processes = markerIndex >= 0 ? output.slice(markerIndex + marker.length) : '';
    return {
      firmware,
      codesys: markerIndex < 0 ? 'unknown' : parseWagoCodesysClassification(processes),
    };
  }
}
