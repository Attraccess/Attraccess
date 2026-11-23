import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PluginBleError, type PluginBleErrorCode } from '@attraccess/plugins-backend-sdk';

/** An error as it crosses from one API instance to another. */
export type SerializedClusterError =
  | { kind: 'http'; status: number; response: string | Record<string, unknown> }
  | { kind: 'ble'; code: PluginBleErrorCode; message: string; operation?: string; detail?: string }
  | { kind: 'error'; name: string; message: string };

/** The HTTP errors callers check with `instanceof` come back as their own class. */
const HTTP_CLASSES: Record<number, new (response: string | Record<string, unknown>) => HttpException> = {
  400: BadRequestException,
  403: ForbiddenException,
  404: NotFoundException,
  408: RequestTimeoutException,
  409: ConflictException,
  410: GoneException,
  503: ServiceUnavailableException,
};

/** Never carries a stack, a cause or ioredis command arguments (AUTH errors hold the password there). */
export function serializeClusterError(error: unknown): SerializedClusterError {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    return { kind: 'http', status: error.getStatus(), response: response as string | Record<string, unknown> };
  }
  if (error instanceof PluginBleError) {
    return { kind: 'ble', code: error.code, message: error.message, operation: error.operation, detail: error.detail };
  }
  const { name, message } = (error ?? {}) as Partial<Error>;
  return { kind: 'error', name: name ?? 'Error', message: message ?? String(error) };
}

export function deserializeClusterError(serialized: SerializedClusterError): Error {
  switch (serialized.kind) {
    case 'http': {
      const HttpClass = HTTP_CLASSES[serialized.status];
      return HttpClass ? new HttpClass(serialized.response) : new HttpException(serialized.response, serialized.status);
    }
    case 'ble':
      return new PluginBleError(serialized.code, serialized.message, {
        operation: serialized.operation,
        detail: serialized.detail,
      });
    default: {
      const error = new Error(serialized.message);
      error.name = serialized.name;
      return error;
    }
  }
}

/** No answer from the instance asked within the timeout (it is gone, overloaded, or Valkey dropped the message). */
export class ClusterRequestTimeoutError extends Error {
  constructor(type: string, instanceId: string) {
    super(`Instance ${instanceId} did not answer ${type} in time`);
    this.name = 'ClusterRequestTimeoutError';
  }
}

/** The instance asked went away (its heartbeat lapsed) before it answered. */
export class ClusterInstanceGoneError extends Error {
  constructor(instanceId: string) {
    super(`Instance ${instanceId} is gone`);
    this.name = 'ClusterInstanceGoneError';
  }
}
