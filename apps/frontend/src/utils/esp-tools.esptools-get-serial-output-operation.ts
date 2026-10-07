import { ESPToolsDisconnectOperation } from './esp-tools.esptools-disconnect-operation';

export abstract class ESPToolsGetSerialOutputOperation extends ESPToolsDisconnectOperation {
  public async getSerialOutput(onWrite: (data: Uint8Array) => unknown) {
    return await this.useTransport({
      blocking: false,
      fn: async (transport) => {
        let isConsoleClosed = false;
        const readLoopPromise = transport.rawRead(
          (data) => onWrite(data),
          () => isConsoleClosed,
        );

        return async () => {
          isConsoleClosed = true;
          await readLoopPromise;
        };
      },
    });
  }
}
