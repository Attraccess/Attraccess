import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpTool } from './openapi-tools';

export type RestRequest = { method: string; url: string; body?: unknown };

export const MAX_RESULT_CHARS = 1_000_000;

/** Why a tool call cannot be turned into a REST request. Reported to the model as a tool error. */
export class McpArgumentError extends Error {}

/** Builds the REST request for a tool call: path substitution, query string and JSON body. */
export function buildRestRequest(tool: McpTool, args: Record<string, unknown>): RestRequest {
  const known = new Set(Object.keys(tool.inputSchema.properties));
  const unknown = Object.keys(args).filter((name) => !known.has(name));
  if (unknown.length) throw new McpArgumentError(`Unknown argument(s): ${unknown.join(', ')}`);
  let path = tool.path;
  for (const name of tool.pathParameters) {
    const value = args[name];
    if (value === undefined || value === null || typeof value === 'object') {
      throw new McpArgumentError(`Path parameter "${name}" is required`);
    }
    path = path.split(`{${name}}`).join(encodeURIComponent(String(value)));
  }
  const query = new URLSearchParams();
  for (const name of tool.queryParameters) {
    const value = args[name];
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(name, typeof item === 'object' ? JSON.stringify(item) : String(item));
    }
  }
  let body: unknown;
  if (tool.wholeBody) {
    body = args.body;
  } else if (tool.bodyProperties.length) {
    const entries = tool.bodyProperties.filter((name) => args[name] !== undefined).map((name) => [name, args[name]]);
    body = Object.fromEntries(entries);
  }
  const search = query.toString();
  return { method: tool.method, url: search ? `${path}?${search}` : path, body };
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

function truncate(text: string): string {
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n[truncated: response exceeded ${MAX_RESULT_CHARS} characters]`
    : text;
}

/** Maps a REST response to a tool result. Body-less statuses (204, 205, 304) and non-JSON bodies are handled. */
export function formatRestResponse(status: number, contentType: string | undefined, payload: string): CallToolResult {
  const isJson = Boolean(contentType && /json/i.test(contentType));
  const isText = isJson || Boolean(contentType && /^text\//i.test(contentType));
  if (status >= 200 && status < 300) {
    if (status === 204 || status === 205 || !payload) {
      return { content: [{ type: 'text', text: `HTTP ${status}: success, no response body` }] };
    }
    if (!isText) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `HTTP ${status}: the endpoint returned ${contentType ?? 'an unknown media type'}, which MCP tools cannot carry`,
          },
        ],
      };
    }
    return { content: [{ type: 'text', text: truncate(payload) }] };
  }
  let message = payload.trim().slice(0, 2000);
  if (isJson && payload) {
    try {
      const parsed = JSON.parse(payload) as { message?: unknown; error?: unknown };
      if (Array.isArray(parsed.message)) message = parsed.message.map(String).join('; ');
      else if (typeof parsed.message === 'string') message = parsed.message;
      else if (typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // keep the raw text
    }
  }
  const label = STATUS_TEXT[status] ?? '';
  return {
    isError: true,
    content: [{ type: 'text', text: `HTTP ${status}${label ? ` ${label}` : ''}${message ? `: ${message}` : ''}` }],
  };
}
