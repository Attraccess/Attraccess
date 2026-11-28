import type { PluginSystemStatusDto } from '@attraccess/react-query-client';
import { reloadPage } from './reloadPage';

type GetStatus = () => Promise<PluginSystemStatusDto | undefined>;

/**
 * Restarts the API through `trigger` (Restart now, or a plugin retry), waits until a new API instance answers and
 * reloads the page, so it runs against the restarted server. Rejects when the restart fails or takes too long.
 */
export async function restartServerAndReload(
  getStatus: GetStatus,
  trigger: () => Promise<unknown>,
  onTriggered?: () => void,
): Promise<void> {
  const previousInstanceId = await getServerInstanceId(getStatus);
  await trigger();
  onTriggered?.();
  await waitForServerRestart(previousInstanceId, getStatus);
  reloadPage();
}

export function wait(delay: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delay));
}

export async function waitForServerRestart(previousInstanceId: string, getStatus: GetStatus) {
  const deadline = Date.now() + SERVER_RESTART_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      if ((await getServerInstanceId(getStatus)) !== previousInstanceId) return;
    } catch {
      // A restart may temporarily make the status endpoint unavailable.
    }

    await wait(Math.min(SERVER_READY_POLL_INTERVAL_MS, deadline - Date.now()));
  }

  throw new Error('Plugin system restart timed out');
}

export const SERVER_READY_POLL_INTERVAL_MS = 250;

/** A restart applies every pending plugin change (migrations included), which can take a while. */
export const SERVER_RESTART_TIMEOUT_MS = 120_000;

export const SERVER_STATUS_REQUEST_TIMEOUT_MS = 2_000;

export async function getServerInstanceId(getStatus: GetStatus) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const status = await Promise.race([
    getStatus(),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Plugin system status request timed out')),
        SERVER_STATUS_REQUEST_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  if (!status || typeof status.instanceId !== 'string') throw new Error('Plugin system instance ID is missing');
  return status.instanceId;
}
