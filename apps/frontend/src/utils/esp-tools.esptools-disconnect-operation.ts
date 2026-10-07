import { ESPToolsHardResetOperation } from './esp-tools.esptools-hard-reset-operation';

export abstract class ESPToolsDisconnectOperation extends ESPToolsHardResetOperation {
  public async disconnect(): Promise<void> {
    if (!this._transport) {
      return;
    }

    try {
      await this._transport.disconnect();
    } catch (err) {
      console.error('Error disconnecting transport:', err);
    } finally {
      this._transport = null;
      this.setConnectionState(false);
    }
  }
}
