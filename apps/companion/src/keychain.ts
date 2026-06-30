import * as keytar from 'keytar';

const SERVICE = 'attraccess-companion';
const ACCOUNT = 'device-credentials';
const PIN_ACCOUNT = 'device-pin';

export interface StoredCredentials {
  id: number;
  token: string;
  serverUrl: string;
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const raw = await keytar.getPassword(SERVICE, ACCOUNT);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify(creds));
}

export async function clearCredentials(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}

export async function savePin(pinHash: string): Promise<void> {
  await keytar.setPassword(SERVICE, PIN_ACCOUNT, pinHash);
}

export async function loadPin(): Promise<string | null> {
  return keytar.getPassword(SERVICE, PIN_ACCOUNT);
}
