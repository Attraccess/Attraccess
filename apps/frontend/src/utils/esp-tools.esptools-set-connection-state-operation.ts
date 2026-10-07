import { ConnectionStateEvent } from './esp-tools.contracts';
import { ESPToolsOffOperation } from './esp-tools.esptools-off-operation';

export abstract class ESPToolsSetConnectionStateOperation extends ESPToolsOffOperation {
  protected setConnectionState(connected: boolean): void {
    this.emit('connectionState', {
      connected,
      timestamp: Date.now(),
    } as ConnectionStateEvent);
  }
}
