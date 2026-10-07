import { Transport } from 'esptool-js';
import { UseTransportOptionsBlocking } from './esp-tools.contracts';
import { UseTransportOptionsNonBlocking } from './esp-tools.contracts';
import { ESPToolsSetConnectionStateOperation } from './esp-tools.esptools-set-connection-state-operation';
export abstract class ESPToolsUseTransportOperation extends ESPToolsSetConnectionStateOperation {
  protected async useTransport<TResult = unknown>(
    opts: UseTransportOptionsBlocking<TResult> | UseTransportOptionsNonBlocking<TResult>,
  ): Promise<TResult> {
    let transport: Transport = this._transport as Transport;

    if (!this._transport) {
      const connectionResult = await this.connectToDevice();
      if (!connectionResult.success) {
        throw new Error('Failed to connect to device');
      }
      transport = this._transport as unknown as Transport;
    }

    const release = await this._transportMutex.acquire();

    try {
      if (opts.blocking) {
        return await opts.fn(transport, release);
      }

      return await (opts as UseTransportOptionsNonBlocking<TResult>).fn(transport);
    } catch (err) {
      if (!transport.device.connected) {
        console.debug('Device disconnected, disconnecting transport');
        this.setConnectionState(false);
        this._transport = null;
        throw err;
      }

      console.error('Error using transport:', err);
      if (
        err instanceof Error &&
        (err.message.includes('The port is closed') || err.message.includes('The device has been lost.'))
      ) {
        this.disconnect().catch((err) => {
          console.error('Error disconnecting transport:', err);
        });
      }

      throw err;
    } finally {
      release();
    }
  }
}
