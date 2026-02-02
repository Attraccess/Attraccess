import { getBaseUrl } from './index';

export type SystemSettings = {
  app: {
    frontendUrl: string | null;
    backendUrl: string | null;
    publicInternetUrl: string | null;
    licenseKeyConfigured: boolean;
  };
  smtp: {
    service: 'SMTP' | 'Outlook365' | null;
    host: string | null;
    port: number | null;
    secure: boolean | null;
    user: string | null;
    from: string | null;
    passConfigured: boolean;
  };
};

export type UpdateSystemSettingsPayload = {
  app?: {
    frontendUrl?: string | null;
    backendUrl?: string | null;
    publicInternetUrl?: string | null;
    licenseKey?: string;
  };
  smtp?: {
    service?: 'SMTP' | 'Outlook365' | null;
    host?: string | null;
    port?: number | null;
    secure?: boolean | null;
    user?: string | null;
    pass?: string | null;
    from?: string | null;
  };
};

type BooleanDto = { value: boolean };

const settingsBaseUrl = `${getBaseUrl()}/api/settings`;

async function requestJson<T>(url: string, options: RequestInit & { method: 'GET' | 'POST' | 'PATCH' }): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body
        ? Array.isArray((body as { message?: string | string[] }).message)
          ? (body as { message?: string[] }).message?.join(', ')
          : String((body as { message?: string }).message)
        : response.statusText;

    throw new Error(message || response.statusText);
  }

  return body as T;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  return requestJson<SystemSettings>(settingsBaseUrl, { method: 'GET' });
}

export async function updateSystemSettings(payload: UpdateSystemSettingsPayload): Promise<SystemSettings> {
  return requestJson<SystemSettings>(settingsBaseUrl, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getFirstTimeSetupAvailable(): Promise<BooleanDto> {
  return requestJson<BooleanDto>(`${settingsBaseUrl}/first-time-setup`, { method: 'GET' });
}

export async function applyFirstTimeSetup(payload: UpdateSystemSettingsPayload): Promise<SystemSettings> {
  return requestJson<SystemSettings>(`${settingsBaseUrl}/first-time-setup`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
