import type { PluginSystemStatusDto } from '@attraccess/react-query-client';
import { SERVER_RESTART_TIMEOUT_MS, SERVER_READY_POLL_INTERVAL_MS } from './index.state';
import { getServerInstanceId } from './index.dependency-error.helpers';

export function wait(delay: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delay));
}

export async function waitForServerRestart(
  previousInstanceId: string,
  getStatus: () => Promise<PluginSystemStatusDto | undefined>,
) {
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
