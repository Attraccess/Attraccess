import { isRecord } from './DeviceInfoDrawer.is-record';

export function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (Array.isArray(value)) return value[Number(key)];
    return isRecord(value) ? value[key] : undefined;
  }, source);
}
