import { app, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ponytail: electron's safeStorage is the OS keychain (Keychain / DPAPI / libsecret),
// so no native module to build or ship. Ciphertext lives next to settings.json.

interface Secrets {
  credentials?: string;
  pin?: string;
}

export interface StoredCredentials {
  id: number;
  token: string;
  serverUrl: string;
}

function secretsPath(): string {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function readAll(): Secrets {
  try {
    return JSON.parse(fs.readFileSync(secretsPath(), 'utf8')) as Secrets;
  } catch {
    return {};
  }
}

function write(key: keyof Secrets, value: string | undefined): void {
  const all = readAll();
  if (value === undefined) delete all[key];
  else all[key] = safeStorage.encryptString(value).toString('base64');
  fs.writeFileSync(secretsPath(), JSON.stringify(all), { mode: 0o600 });
}

function read(key: keyof Secrets): string | null {
  const raw = readAll()[key];
  if (!raw) return null;
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'));
  } catch {
    // keychain entry unreadable (different user, reset keyring) — treat as absent
    return null;
  }
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const raw = read('credentials');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  write('credentials', JSON.stringify(creds));
}

export async function clearCredentials(): Promise<void> {
  write('credentials', undefined);
}

export async function savePin(pinHash: string): Promise<void> {
  write('pin', pinHash);
}

export async function loadPin(): Promise<string | null> {
  return read('pin');
}
