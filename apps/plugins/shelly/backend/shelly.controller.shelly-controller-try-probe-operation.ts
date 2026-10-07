import { ProbeOutcome } from './shelly.contracts';
import { ShellyControllerRequireDeviceWithGenerationOperation } from './shelly.shelly-controller-require-device-with-generation-operation';
export abstract class ShellyControllerTryProbeOperation extends ShellyControllerRequireDeviceWithGenerationOperation {
  protected async tryProbe(ipAddress: string): Promise<ProbeOutcome> {
    const at = new Date().toISOString();
    try {
      return { result: await this.probe.probe(ipAddress), error: null, at };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err), at };
    }
  }
}
