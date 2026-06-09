// Thin fetch wrapper over the plugin's own backend endpoints (`/api/shelly/*`).
// Session auth rides on the cookie, so every call includes credentials. We use
// plain fetch rather than the host's react-query client because only a fixed set
// of singletons (react, react-dom, react-router-dom, @heroui/react, lucide-react)
// is shared with plugins over module federation.

export type AuthState = 'unknown' | 'none' | 'required';

export interface ShellyDevice {
  id: number;
  name: string;
  ipAddress: string;
  generation: number | null;
  model: string | null;
  authState: AuthState;
  lastProbeAt: string | null;
  lastProbeError: string | null;
  createdAt: string;
  updatedAt: string;
}

const BASE = '/api/shelly';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
  /** JSON body — serialised and Content-Type set automatically. */
  body?: unknown;
}

/**
 * Single seam for every plugin API call. Handles the things that are the same
 * on every request — base URL, cookie credentials, JSON headers/serialisation,
 * and error parsing — so callers only pass what differs (path, method, body).
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const errorBody = (await res.json()) as { message?: string | string[] };
      if (errorBody?.message) {
        message = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
      }
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export function listDevices(): Promise<ShellyDevice[]> {
  return request<ShellyDevice[]>('/devices');
}

export function addDevice(input: { ipAddress: string; name?: string }): Promise<ShellyDevice> {
  return request<ShellyDevice>('/devices', { method: 'POST', body: input });
}

export function reprobeDevice(id: number): Promise<ShellyDevice> {
  return request<ShellyDevice>(`/devices/${id}/probe`, { method: 'POST' });
}

export function deleteDevice(id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/devices/${id}`, { method: 'DELETE' });
}
