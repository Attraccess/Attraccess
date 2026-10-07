import { osAdapter } from './platform-adapter';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { state } from './state';
import * as https from 'https';
import * as http from 'http';
import { createHash } from 'crypto';
import { reloadKiosk } from './kiosk';
import { lockComputer } from './kiosk';
import { setTrayState } from './tray';
import { disableAdminOverride as _disableAdminOverride } from './admin-override';
import { unlockComputer } from './kiosk';
import { enableAdminOverride as _enableAdminOverride } from './admin-override';

export // ─── App lifecycle ────────────────────────────────────────────────────────────

function allPermissionsGranted(): boolean {
  const { needed, accessibility } = osAdapter.permissionsStatus();
  return !needed || accessibility;
}

export // ─── Auto-update ──────────────────────────────────────────────────────────────

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(dest);
    const req = mod.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => undefined);
        return reject(new Error(`Download failed: HTTP ${res.statusCode ?? 'unknown'}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => undefined);
      reject(err);
    });
    req.setTimeout(120000, () => {
      req.destroy();
      file.close();
      fs.unlink(dest, () => undefined);
      reject(new Error('Download timed out'));
    });
  });
}

export function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

export async function applyUpdate(
  serverUrl: string,
  downloadUrl: string,
  version: string,
  sha256?: string,
): Promise<void> {
  // Validate server-supplied version before using it in a filesystem path to prevent
  // path traversal (e.g. version="../../../../etc/evil" escaping os.tmpdir()).
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`[companion] refusing update with invalid version string: ${JSON.stringify(version)}`);
    return;
  }
  const absUrl = downloadUrl.startsWith('http') ? downloadUrl : `${serverUrl}${downloadUrl}`;
  // Reject downloads from a different origin than the configured server.
  // The server always sends relative paths today, but defend against a future
  // server bug or compromise that returns a redirect to a third-party host.
  if (downloadUrl.startsWith('http')) {
    try {
      const expectedOrigin = new URL(serverUrl).origin;
      const actualOrigin = new URL(absUrl).origin;
      if (actualOrigin !== expectedOrigin) {
        console.error(
          `[companion] refusing update from different origin: expected ${expectedOrigin}, got ${actualOrigin}`,
        );
        return;
      }
    } catch {
      console.error('[companion] refusing update — could not parse server/download URL for origin check');
      return;
    }
  }
  if (absUrl.startsWith('http:')) {
    console.warn('[companion] update download is using plain HTTP — no transport encryption');
  }
  const ext = path.extname(absUrl.split('?')[0] ?? '') || osAdapter.updateExtension;
  // random suffix prevents predictable temp path (TOCTOU)
  const dest = path.join(
    app.getPath('temp'),
    `attraccess-companion-update-${version}-${randomBytes(4).toString('hex')}${ext}`,
  );

  console.info(`[companion] downloading update v${version} from ${absUrl}`);
  try {
    await downloadFile(absUrl, dest);
    if (sha256) {
      const actual = await computeSha256(dest);
      if (actual !== sha256) {
        fs.unlink(dest, () => undefined);
        console.error(`[companion] update v${version} checksum mismatch — expected ${sha256}, got ${actual}`);
        state.tray?.setToolTip(`Attraccess Companion — update v${version} checksum failed`);
        return;
      }
    } else {
      // Fail closed: refuse to auto-apply updates without a checksum. The server
      // should always supply sha256 for builds produced by copy-companion-into-assets.js.
      fs.unlink(dest, () => undefined);
      console.error(`[companion] update v${version} has no checksum — refusing to apply`);
      state.tray?.setToolTip(`Attraccess Companion — update v${version} missing checksum`);
      return;
    }
  } catch (err) {
    console.error('[companion] update download failed:', err);
    state.tray?.setToolTip(`Attraccess Companion — update v${version} download failed`);
    return;
  }

  console.info(`[companion] update downloaded to ${dest}`);
  await osAdapter.applyUpdate(dest, version, () => {
    state.allowQuit = true;
  });
}

export // ─── Health check ─────────────────────────────────────────────────────────────

function checkHealth(serverUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/api/info', serverUrl);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(url.toString(), (res) => {
      resolve(res.statusCode !== undefined && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export function disableAdminOverride(): void {
  _disableAdminOverride(lockComputer, setTrayState, reloadKiosk);
}

export // ─── Admin override ───────────────────────────────────────────────────────────

function enableAdminOverride(): void {
  _enableAdminOverride(unlockComputer, setTrayState);
}
