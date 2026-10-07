import { ESPToolsInternalHardResetOperation } from './esp-tools.esptools-internal-hard-reset-operation';

export abstract class ESPToolsHardResetOperation extends ESPToolsInternalHardResetOperation {
  public async hardReset(): Promise<void> {
    return await this.useTransport({
      blocking: true,
      fn: async (transport) => {
        await this._hardReset(transport);
      },
    });
  }
}
