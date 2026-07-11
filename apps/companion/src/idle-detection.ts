import { powerMonitor } from 'electron';
import { state } from './state';

let timer: NodeJS.Timeout | null = null;
let idleState: 'active' | 'idle' = 'active';

export function startIdleDetection(): void {
  stopIdleDetection();
  if (state.settings.idleTimeoutMinutes <= 0) return;

  const thresholdSeconds = state.settings.idleTimeoutMinutes * 60;
  timer = setInterval(() => {
    if (!state.wsClient) return;
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const nowIdle = idleSeconds >= thresholdSeconds;
    if (nowIdle && idleState === 'active') {
      idleState = 'idle';
      state.wsClient.sendIdle({ idleSeconds, platform: process.platform });
    } else if (!nowIdle && idleState === 'idle') {
      idleState = 'active';
      state.wsClient.sendActive({ idleSeconds, platform: process.platform });
    }
  }, 5000);
}

export function stopIdleDetection(): void {
  if (timer) { clearInterval(timer); timer = null; }
  idleState = 'active';
}
