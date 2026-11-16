import { closeSync } from 'fs';
import type { AttractapCrashReportHandler } from './handlers/crash-report/crash-report.handler';
import type { AttractapUiHandler } from './handlers/ui/ui.handler';
import type { AuthenticatedWebSocket } from './websocket.types';

/**
 * Drops what a closed socket still holds besides its reader identity: open reader UI steps, timers, the
 * OTA file and a partial coredump upload. Flows bound to the reader (login, supervision, mass introduction,
 * enrollment, reset) are the gateway's `resetReaderConnectionState`, which runs before this.
 */
export function cleanupSocketState(
  socket: AuthenticatedWebSocket,
  handlers: {
    uiHandler: AttractapUiHandler;
    crashReportHandler: Pick<AttractapCrashReportHandler, 'discardCoredumpUpload'>;
  },
): void {
  if (socket.state) handlers.uiHandler.cleanup(socket);

  // Clean up OTA file descriptor if present
  if (socket.state?.ota?.fd) {
    try {
      closeSync(socket.state.ota.fd);
    } catch {
      // nothing to do
    }
  }

  // The reader restarts a partial coredump upload after it reconnects.
  handlers.crashReportHandler.discardCoredumpUpload(socket.id);
}
