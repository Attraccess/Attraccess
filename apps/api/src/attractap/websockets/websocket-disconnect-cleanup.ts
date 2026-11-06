import { closeSync } from 'fs';
import type { AttractapUiHandler } from './handlers/ui/ui.handler';
import type { AuthenticatedWebSocket } from './websocket.types';

/**
 * Drops what a closed socket still holds besides its reader identity: open reader UI steps, timers and
 * the OTA file. Flows bound to the reader (login, supervision, mass introduction, enrollment, reset) are
 * the gateway's `resetReaderConnectionState`, which runs before this.
 */
export function cleanupSocketState(socket: AuthenticatedWebSocket, handlers: { uiHandler: AttractapUiHandler }): void {
  if (socket.state) handlers.uiHandler.cleanup(socket);

  // Clean up OTA file descriptor if present
  if (socket.state?.ota?.fd) {
    try {
      closeSync(socket.state.ota.fd);
    } catch {
      // nothing to do
    }
  }
}
