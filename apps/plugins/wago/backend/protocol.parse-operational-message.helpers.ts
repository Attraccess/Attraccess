import { parseMeasurement } from '../measurement-contract';
import type { WagoOperationalMessage } from './protocol.contracts';
import { normalizeOperationalPrefix } from './protocol.acknowledgement-hardware-id.helpers';
import { CONFIGURATION_PROTOCOL_VERSION } from './protocol.state';
import { parseObject } from './protocol.acknowledgement-hardware-id.helpers';
import type { WagoOperationalMessageBase } from './protocol.contracts';
import type { WagoStateMessage } from './protocol.contracts';
import { isNullableInteger } from './protocol.acknowledgement-hardware-id.helpers';
import { isNullableString } from './protocol.acknowledgement-hardware-id.helpers';
import { isBooleanRecord } from './protocol.acknowledgement-hardware-id.helpers';
export function requiredTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('operational timestamp is invalid');
  return value;
}
export function requiredSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('operational sequence is invalid');
  return value as number;
}

export function parseStateMessage(
  value: Record<string, unknown>,
  envelope: WagoOperationalMessageBase,
): WagoStateMessage {
  if (
    typeof value.connected !== 'boolean' ||
    !isNullableInteger(value.revision) ||
    !isNullableString(value.contentHash) ||
    !isBooleanRecord(value.outputs) ||
    (value.inputs !== undefined && !isBooleanRecord(value.inputs)) ||
    (value.readiness !== undefined &&
      (!value.readiness ||
        typeof value.readiness !== 'object' ||
        Array.isArray(value.readiness) ||
        typeof (value.readiness as Record<string, unknown>).hardwareAvailable !== 'boolean'))
  )
    throw new Error('invalid state message');
  return {
    category: 'state',
    ...envelope,
    connected: value.connected,
    revision: value.revision as number | null,
    contentHash: value.contentHash as string | null,
    outputs: value.outputs as Record<string, boolean>,
    ...(value.inputs !== undefined ? { inputs: value.inputs as Record<string, boolean> } : {}),
    ...(value.readiness !== undefined
      ? { readiness: { hardwareAvailable: (value.readiness as { hardwareAvailable: boolean }).hardwareAvailable } }
      : {}),
  };
}

export function parseOperationalMessage(
  prefix: string,
  topic: string,
  payload: Buffer,
): { hardwareId: string; message: WagoOperationalMessage } | null {
  const root = `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/`;
  if (!topic.startsWith(root)) return null;
  const [hardwareId, suffix, extra] = topic.slice(root.length).split('/');
  if (
    !hardwareId ||
    /[+#]/.test(hardwareId) ||
    extra !== undefined ||
    !['state', 'measurements', 'faults', 'acknowledgements'].includes(suffix)
  )
    return null;
  const value = parseObject(payload, 'operational message');
  const timestamp = requiredTimestamp(value.timestamp);
  const sequence = requiredSequence(value.sequence);
  if (typeof value.streamId !== 'string' || !value.streamId.trim() || value.streamId.length > 128)
    throw new Error('operational streamId is invalid');
  const streamId = value.streamId;
  if (suffix === 'state') {
    return { hardwareId, message: parseStateMessage(value, { timestamp, streamId, sequence }) };
  }
  if (suffix === 'measurements') {
    return {
      hardwareId,
      message: {
        category: 'measurement',
        timestamp,
        streamId,
        sequence,
        ...parseMeasurement(value),
      },
    };
  }
  if (suffix === 'faults') {
    if (typeof value.channelId !== 'string' || typeof value.code !== 'string' || typeof value.message !== 'string')
      throw new Error('invalid fault message');
    return {
      hardwareId,
      message: {
        category: 'fault',
        timestamp,
        streamId,
        sequence,
        channelId: value.channelId,
        code: value.code,
        message: value.message,
      },
    };
  }
  if (
    typeof value.id !== 'string' ||
    !['accepted', 'duplicate', 'rejected'].includes(value.status as string) ||
    (value.error !== undefined && typeof value.error !== 'string')
  )
    throw new Error('invalid acknowledgement message');
  return {
    hardwareId,
    message: {
      category: 'acknowledgement',
      timestamp,
      streamId,
      sequence,
      id: value.id,
      status: value.status as 'accepted' | 'duplicate' | 'rejected',
      error: value.error as string | undefined,
    },
  };
}
