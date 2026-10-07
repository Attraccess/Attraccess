import { api } from './api.acknowledge-configuration-rejection.state';

export const manualCommand = (id: number, command: ManualCommand) =>
  api.request<{ result: 'acknowledged' | 'rejected' | 'timeout' | 'transport_failure' }>(
    `/controllers/${id}/commands`,
    { method: 'POST', body: command },
  );
export interface ManualCommand {
  channelId: string;
  action: 'set' | 'pulse' | 'release';
  value?: boolean;
  expectedConfigurationRevision: number;
  acknowledgementTimeoutSeconds: number;
}
