import { diffValue } from './configuration.add-id.helpers';

export function configurationDiff(previous: unknown, current: unknown): ConfigurationDiff[] {
  const changes: ConfigurationDiff[] = [];
  diffValue('$', previous, current, changes);
  return changes;
}
export interface ConfigurationDiff {
  path: string;
  previous: unknown;
  current: unknown;
}
