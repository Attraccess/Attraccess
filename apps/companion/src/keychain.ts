import * as keytar from 'keytar';

const SERVICE = 'attraccess-companion';
const ACCOUNT = 'device-credentials';

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
