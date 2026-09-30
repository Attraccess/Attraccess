import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface CompanionSettings {
  idleTimeoutMinutes: number; // 0 = disabled
  foregroundApp: boolean;
  usbDevices: boolean;
}

export const SETTINGS_DEFAULTS: CompanionSettings = { idleTimeoutMinutes: 15, foregroundApp: true, usbDevices: true };

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): CompanionSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    return { ...SETTINGS_DEFAULTS, ...(JSON.parse(raw) as Partial<CompanionSettings>) };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(s: CompanionSettings): void {
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
}
