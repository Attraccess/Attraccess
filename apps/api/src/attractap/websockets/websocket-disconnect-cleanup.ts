import { closeSync } from 'fs';
import type { AttractapMassIntroductionHandler } from './handlers/mass-introduction/mass-introduction.handler';
import type { AttractapSupervisionHandler } from './handlers/supervision/supervision.handler';
import type { AttractapUiHandler } from './handlers/ui/ui.handler';
import type { AuthenticatedWebSocket } from './websocket.types';

/** Drops everything a closed socket still holds: flows, open reader UI steps, timers and the OTA file. */
export function cleanupSocketState(
  socket: AuthenticatedWebSocket,
  readerId: number | null,
  handlers: {
    supervisionHandler: AttractapSupervisionHandler;
    massIntroductionHandler: AttractapMassIntroductionHandler;
    uiHandler: AttractapUiHandler;
  },
): void {
  // Tear down any in-progress two-card supervision so the supervisor's web popup doesn't linger.
  if (socket.state?.supervisionFlow) {
    handlers.supervisionHandler.cancelForSocket(socket);
  }
  if (socket.state?.massIntroductionFlow) {
    handlers.massIntroductionHandler.cancelForSocket(socket, readerId);
  }
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
