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

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) {
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      }
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function listDevices(): Promise<ShellyDevice[]> {
  return fetch(`${BASE}/devices`, { credentials: 'include' }).then((r) => parse<ShellyDevice[]>(r));
}

export function addDevice(input: { ipAddress: string; name?: string }): Promise<ShellyDevice> {
  return fetch(`${BASE}/devices`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((r) => parse<ShellyDevice>(r));
}

export function reprobeDevice(id: number): Promise<ShellyDevice> {
  return fetch(`${BASE}/devices/${id}/probe`, { method: 'POST', credentials: 'include' }).then((r) =>
    parse<ShellyDevice>(r)
  );
}

export function deleteDevice(id: number): Promise<{ deleted: boolean }> {
  return fetch(`${BASE}/devices/${id}`, { method: 'DELETE', credentials: 'include' }).then((r) =>
    parse<{ deleted: boolean }>(r)
  );
}
