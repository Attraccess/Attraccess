import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeControllerNetwork,
  getNetworkChangeStatus,
  listMqttServers,
  retirePreviousMqttCredentials,
  retryControllerNetworkChange,
} from './api';
import { useWagoTranslations } from './i18n';
import { useWagoLiveQuery } from './live-updates';

export function useNetworkChangeFormState({ controllerId }: { controllerId: number }) {
  const { t } = useWagoTranslations(),
    client = useQueryClient();
  const queryKey = ['wago', 'network-change', controllerId];
  useWagoLiveQuery(queryKey, 'network-change', String(controllerId));
  const statusQuery = useQuery({
    queryKey,
    queryFn: () => getNetworkChangeStatus(controllerId),
    retry: false,
  });
  const servers = useQuery({ queryKey: ['mqtt', 'servers'], queryFn: listMqttServers, retry: false });
  const [editedTargetHost, setTargetHost] = useState<string | undefined>(),
    [editedServer, setServer] = useState<string | null | undefined>();
  const status = statusQuery.data,
    operation = status?.operation;
  const pending = !!operation && operation.phase !== 'completed';
  const editable = !pending || (operation?.phase === 'connecting' && !!operation.failure && !operation.running);
  // Untouched fields follow fresh status; each deliberate edit survives refetches.
  const targetHost = editedTargetHost ?? (pending && operation ? operation.targetHost : (status?.targetHost ?? ''));
  const server =
    editedServer !== undefined
      ? editedServer
      : String((pending && operation ? operation.mqttServerId : status?.mqttServerId) ?? 'address');
  const mutation = useMutation({
    mutationFn: (kind: 'apply' | 'retry' | 'retire') =>
      kind === 'retry'
        ? retryControllerNetworkChange(controllerId)
        : kind === 'retire'
          ? retirePreviousMqttCredentials(controllerId)
          : changeControllerNetwork(controllerId, {
              targetHost: targetHost.trim(),
              mqttServerId: server === 'address' ? null : Number(server),
            }),
    onSuccess: async (value) => {
      client.setQueryData(queryKey, value);
      setTargetHost(undefined);
      setServer(undefined);
      await client.invalidateQueries({ queryKey: ['wago'] });
    },
    onError: async () => {
      await statusQuery.refetch();
    },
  });
  const busy = mutation.isPending || !!operation?.running;
  const failure = operation?.failure;
  const validHost = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(targetHost.trim());
  const selectedServer = servers.data?.find((item) => String(item.id) === server);
  return {
    t,
    statusQuery,
    servers,
    setTargetHost,
    setServer,
    status,
    operation,
    pending,
    editable,
    targetHost,
    server,
    mutation,
    busy,
    failure,
    validHost,
    selectedServer,
  } as const;
}
