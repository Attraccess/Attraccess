import { Tray, Menu, dialog, nativeImage, app } from 'electron';
import { state } from './state';
import { dotIconPng } from './tray-icon';
import { reopenKiosk } from './kiosk';
import { openWizardWindow } from './wizard-window';

export type TrayState = 'locked' | 'unlocked' | 'disconnected';

const TRAY_COLORS: Record<TrayState, [number, number, number]> = {
  unlocked: [34, 197, 94],       // green
  locked: [239, 68, 68],         // red
  disconnected: [148, 163, 184], // gray
};

function dotIcon(color: [number, number, number]): Electron.NativeImage {
  return nativeImage.createFromBuffer(dotIconPng(color));
}

function buildTrayMenu(trayState: TrayState): Menu {
  return Menu.buildFromTemplate([
    ...(trayState === 'unlocked'
      ? [{ type: 'separator' as const }]
      : [
          { label: trayState === 'disconnected' ? 'Connecting…' : 'No active session', enabled: false },
          { type: 'separator' as const },
        ]),
    { label: 'Open resource panel', enabled: !!state.authenticatedPayload, click: () => reopenKiosk() },
    { label: 'Settings', click: () => {
      if (state.pinHash) openWizardWindow({ requirePin: 'settings' });
      else openWizardWindow();
    }},
    { label: 'About', click: () => {
      void dialog.showMessageBox({ title: 'Attraccess Companion', message: `Attraccess Companion\nVersion ${app.getVersion()}` });
    }},
    { label: 'Quit', click: () => app.quit() },
  ]);
}

export function setupTray(): void {
  state.tray = new Tray(dotIcon(TRAY_COLORS.disconnected));
  setTrayState('disconnected');
}

export function setTrayState(trayState: TrayState): void {
  state.tray?.setImage(dotIcon(TRAY_COLORS[trayState]));
  state.tray?.setContextMenu(buildTrayMenu(trayState));
  const resourceName = state.authenticatedPayload?.resources[0]?.name;
  const tooltip = resourceName
    ? `Attraccess Companion — ${resourceName} (${trayState})`
    : `Attraccess Companion — ${trayState}`;
  state.tray?.setToolTip(tooltip);
}
