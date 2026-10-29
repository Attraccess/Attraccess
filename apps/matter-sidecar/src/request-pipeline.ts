import {
  HEADER_REQUEST_DEADLINE,
  MAX_REQUEST_DEADLINE_MS,
  findOperation,
  type FeatureFamily,
  type OperationDefinition,
} from '@attraccess/matter-contract';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkAdmission, type RunningReleases } from './admission';
import type { SidecarConfig } from './config';
import {
  BodyTooLargeError,
  checkLocalAccess,
  correlationIdFrom,
  readBody,
  safeIssues,
  sendError,
  sendJson,
  type ErrorReply,
} from './http-utils';
import type { Logger } from './logger';

export type HandlerContext = {
  params: Record<string, unknown>;
  body: unknown;
  correlationId: string;
  signal: AbortSignal;
};
export type FeatureHandler = (context: HandlerContext) => Promise<unknown> | unknown;
export type FeatureHandlers = Partial<Record<string, FeatureHandler>>;

/** Built-in health handlers receive the live sidecar state. */
export type PipelineDeps = {
  config: SidecarConfig;
  running: RunningReleases;
  logger: Logger;
  isDraining: () => boolean;
  builtIns: Record<string, (correlationId: string) => { status: number; body: unknown }>;
  features: FeatureHandlers;
};

class DeadlineError extends Error {}

function parseDeadline(req: IncomingMessage, body: unknown, fallback: number): number {
  const header = req.headers[HEADER_REQUEST_DEADLINE];
  const fromBody = (body as { deadlineMs?: unknown } | null)?.deadlineMs;
  const candidates = [fallback, MAX_REQUEST_DEADLINE_MS];
  if (typeof header === 'string' && /^[0-9]{1,6}$/.test(header) && Number(header) > 0) candidates.push(Number(header));
  if (typeof fromBody === 'number') candidates.push(fromBody);
  return Math.min(...candidates);
}

async function withDeadline<T>(work: Promise<T> | T, ms: number, controller: AbortController): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DeadlineError());
    }, ms);
  });
  try {
    return await Promise.race([Promise.resolve(work), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function preflight(req: IncomingMessage, operation: OperationDefinition, deps: PipelineDeps): ErrorReply | null {
  if (!operation.versioned) return null;
  if (deps.isDraining()) return { code: 'sidecar_unavailable', message: 'The Matter sidecar is shutting down.' };
  const admission = checkAdmission(req.headers, deps.running);
  return admission.ok ? null : { code: admission.code, message: admission.message, details: admission.details };
}

async function parseInput(
  req: IncomingMessage,
  operation: OperationDefinition,
  params: Record<string, string>,
  limit: number,
) {
  let parsedParams: Record<string, unknown> = params;
  if (operation.params) {
    const result = operation.params.safeParse(params);
    if (!result.success) return { error: invalid('path parameters', result.error) };
    parsedParams = result.data as Record<string, unknown>;
  }
  if (!operation.body) return { params: parsedParams, body: undefined };
  const raw = await readBody(req, limit);
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    return { error: { code: 'validation_failed', message: 'Request body is not valid JSON.' } as ErrorReply };
  }
  const result = operation.body.safeParse(json);
  if (!result.success) return { error: invalid('request body', result.error) };
  return { params: parsedParams, body: result.data };
}

function invalid(what: string, error: Parameters<typeof safeIssues>[0]): ErrorReply {
  return { code: 'validation_failed', message: `Invalid ${what}.`, details: { issues: safeIssues(error) } };
}

async function runFeature(
  operation: OperationDefinition,
  handler: FeatureHandler,
  input: { params: Record<string, unknown>; body: unknown },
  req: IncomingMessage,
  correlationId: string,
  deps: PipelineDeps,
): Promise<{ status: number; body: unknown } | { error: ErrorReply }> {
  const controller = new AbortController();
  const deadlineMs = parseDeadline(req, input.body, deps.config.requestDeadlineMs);
  try {
    const value = await withDeadline(
      handler({ ...input, correlationId, signal: controller.signal }),
      deadlineMs,
      controller,
    );
    const checked = operation.response.safeParse(value);
    if (!checked.success) {
      deps.logger('error', 'handler returned an invalid response', { operation: operation.id });
      return { error: { code: 'internal_error', message: 'The sidecar produced an invalid response.' } };
    }
    return { status: 200, body: checked.data };
  } catch (error) {
    if (error instanceof DeadlineError) {
      return {
        error: {
          code: 'timeout',
          message: operation.physical
            ? 'The request timed out. The effect on the device is uncertain; do not retry automatically.'
            : 'The request timed out.',
          ...(operation.physical ? { outcome: 'uncertain' as const } : {}),
        },
      };
    }
    deps.logger('error', 'handler failed', { operation: operation.id });
    return { error: { code: 'internal_error', message: 'The request failed.' } };
  }
}

function unsupported(family: FeatureFamily): ErrorReply {
  return {
    code: 'unsupported_capability',
    message: `The "${family}" capability is defined by the contract but not available in this sidecar release.`,
    details: { family },
  };
}

async function respond(
  req: IncomingMessage,
  operation: OperationDefinition,
  params: Record<string, string>,
  correlationId: string,
  deps: PipelineDeps,
) {
  const builtIn = deps.builtIns[operation.id];
  if (builtIn) return builtIn(correlationId);
  const input = await parseInput(req, operation, params, deps.config.maxMessageBytes);
  if ('error' in input && input.error) return { error: input.error };
  const handler = deps.features[operation.id];
  if (!handler) return { error: unsupported(operation.family) };
  return runFeature(
    operation,
    handler,
    input as { params: Record<string, unknown>; body: unknown },
    req,
    correlationId,
    deps,
  );
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse, deps: PipelineDeps): Promise<void> {
  const correlationId = correlationIdFrom(req.headers);
  const denied = checkLocalAccess(req.headers);
  if (denied) return sendError(res, { code: 'forbidden_origin', message: denied }, correlationId, true);
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const route = findOperation(req.method ?? 'GET', path);
  if (route.kind === 'not-found') return sendError(res, { code: 'not_found', message: 'Unknown path.' }, correlationId);
  if (route.kind === 'method-not-allowed') {
    return sendError(res, { code: 'method_not_allowed', message: 'Method not allowed.' }, correlationId);
  }
  const { operation, params } = route.match;
  const rejected = preflight(req, operation, deps);
  if (rejected) return sendError(res, rejected, correlationId);
  try {
    const result = await respond(req, operation, params, correlationId, deps);
    if ('error' in result) return sendError(res, result.error, correlationId);
    sendJson(res, result.status, result.body, correlationId);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return sendError(
        res,
        {
          code: 'payload_too_large',
          message: 'Request body exceeds the size limit.',
          details: { limitBytes: deps.config.maxMessageBytes },
        },
        correlationId,
        true,
      );
    }
    deps.logger('error', 'request failed', { operation: operation.id });
    sendError(res, { code: 'internal_error', message: 'The request failed.' }, correlationId);
  }
}
