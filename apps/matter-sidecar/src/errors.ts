import { randomUUID } from 'node:crypto';
import { ERROR_STATUS, ErrorEnvelope, SUPPORTED_RELEASE, type MatterError } from '@attraccess/matter-contract';
import type { IncomingHttpHeaders } from 'node:http';
import { CompatibilityHeaders, Id, Release } from '@attraccess/matter-contract';

type Details = MatterError['error']['details'];
export class ProtocolError extends Error {
  readonly status: number;
  constructor(
    readonly code: MatterError['error']['code'],
    message: string,
    readonly details: Details = {},
  ) {
    super(message);
    this.status = ERROR_STATUS[code];
  }
  envelope(requestId: string, operationId: string | null = null): MatterError {
    return ErrorEnvelope.parse({
      schemaVersion: 1,
      error: {
        code: this.code,
        message: this.message,
        requestId,
        operationId,
        retryable: false,
        details: this.details,
      },
    });
  }
}
export function correlationId(headers: IncomingHttpHeaders): string {
  const value = Id.safeParse(headers['x-request-id']);
  return value.success ? value.data : randomUUID();
}
export function checkCompatibility(headers: IncomingHttpHeaders, ownRelease = SUPPORTED_RELEASE.sidecar): void {
  if (headers.origin !== undefined)
    throw new ProtocolError('FORBIDDEN_ORIGIN', 'Browser Origin requests are not allowed. Use the host plugin.');
  if (headers['x-matter-wire-version'] !== '1')
    throw new ProtocolError(
      'UNSUPPORTED_WIRE_VERSION',
      'Only Matter wire version 1 is supported. Upgrade or downgrade to the supported release combination.',
      { supportedWireVersions: [1], supported: [SUPPORTED_RELEASE] },
    );
  const selected = Object.fromEntries(Object.keys(CompatibilityHeaders.shape).map((key) => [key, headers[key]]));
  if (!Id.safeParse(headers['x-request-id']).success)
    throw new ProtocolError('VALIDATION_ERROR', 'A UUID x-request-id header is required.');
  if (!CompatibilityHeaders.safeParse(selected).success || ownRelease !== SUPPORTED_RELEASE.sidecar) {
    const safeVersion = (value: unknown) => {
      const parsed = Release.safeParse(value);
      return parsed.success ? parsed.data : null;
    };
    throw new ProtocolError(
      'INCOMPATIBLE_RELEASE',
      'Unsupported Attraccess/plugin/sidecar release combination. Upgrade or downgrade each component to the supported combination.',
      {
        received: {
          attraccess: safeVersion(headers['x-attraccess-version']),
          plugin: safeVersion(headers['x-matter-plugin-version']),
          sidecar: safeVersion(ownRelease),
        },
        supported: [SUPPORTED_RELEASE],
      },
    );
  }
}
