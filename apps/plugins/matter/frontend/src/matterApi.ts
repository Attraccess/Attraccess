// Access to `/api/matter/*` for the requests whose failures the page explains: fabric & backup, commissioning, removal
// and sharing. A failure keeps the machine-readable `code` the backend sends next to its English message; the page
// shows the translation of the code (useMatterErrorText), the message is only a fallback.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

/**
 * A failed request: the HTTP status (0 when no response arrived) and the backend's `code` when it sent one. The message
 * is empty when the response had none, for the UI to translate.
 */
export class MatterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'MatterApiError';
  }
}

/** The machine-readable code of a failed request, if the backend sent one. */
export const codeOf = (error: unknown): string | null => (error instanceof MatterApiError ? error.code : null);

/** The HTTP status of a failed request, or null for anything else that was thrown. */
export const statusOf = (error: unknown): number | null => (error instanceof MatterApiError ? error.status : null);

export const matterApiClient = createPluginApiClient('/api/matter');

/** Reads the error body of a failed response (`{ code, message }`), tolerating an empty or non-JSON body. */
export async function toMatterApiError(response: Response): Promise<MatterApiError> {
  try {
    const body = (await response.json()) as { code?: string; message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    return new MatterApiError(message ?? '', response.status, body.code ?? null);
  } catch {
    return new MatterApiError('', response.status, null);
  }
}

/**
 * JSON in, JSON out; an empty response resolves to null. Throws `MatterApiError` for an error response, and with the
 * code `network` when no response arrived (the server is down or the connection dropped).
 */
export async function matterRequest<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await matterApiClient.fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (failure) {
    throw new MatterApiError(failure instanceof Error ? failure.message : String(failure), 0, 'network');
  }
  if (!response.ok) throw await toMatterApiError(response);
  const text = await response.text();
  return (text.length > 0 ? JSON.parse(text) : null) as T;
}
