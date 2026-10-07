import { Command } from './esp-tools.contracts';
import { ESPToolsGetSerialOutputOperation } from './esp-tools.esptools-get-serial-output-operation';

export abstract class ESPToolsSendCommandOperation extends ESPToolsGetSerialOutputOperation {
  public async sendCommand(command: Command, waitForResponse = true, timeout = 15000): Promise<string | null> {
    return await this.useTransport({
      blocking: true,
      fn: async (transport, release) => {
        let commandString = `CMND ${command.topic}`;
        if (command.payload) {
          commandString += ` ${command.payload}`;
        }

        commandString += '\n';

        const commandBuffer = new TextEncoder().encode(commandString + '\n');
        console.debug(`Sending command: "${commandString}"`);
        await transport.write(commandBuffer);

        if (!waitForResponse) {
          return null;
        }

        let continueReading = true;
        let buffer = '';

        const timeoutId = setTimeout(() => {
          continueReading = false;
        }, timeout);

        let resolveResult: ((v: string | null) => void) | null = null;
        const resultPromise = new Promise<string | null>((resolve) => {
          resolveResult = resolve;
        });

        transport.rawRead(
          (value) => {
            if (!continueReading) return;
            const chunk = new TextDecoder().decode(value);
            buffer += chunk;

            const bufferEndsWithNewLine = buffer.endsWith('\n');
            const lines = buffer.split('\n');
            if (!bufferEndsWithNewLine) {
              buffer = lines.pop() || '';
            } else {
              buffer = '';
            }

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine) continue;

              const cleaned = trimmedLine.replace(/^[^\x20-\x7E]*/g, '');
              console.debug('Cleaned line:', cleaned);

              const respMatch = cleaned.match(/^RESP\s+(\S+)\s+(.+)$/);
              if (!respMatch) {
                console.debug('No response match');
                continue;
              }

              const responseTopic = respMatch[1];
              const payload = respMatch[2];
              console.debug('Response topic:', responseTopic);

              if (responseTopic !== command.topic) {
                console.debug('Response topic does not match command topic:', responseTopic, '!==', command.topic);
                continue;
              }

              clearTimeout(timeoutId);
              continueReading = false;
              resolveResult?.(payload ?? null);
              return;
            }
          },
          () => !continueReading,
        );

        return await resultPromise;
      },
    });
  }
}
