import { Button, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  changeControllerNetwork,
  getNetworkChangeStatus,
  listMqttServers,
  retirePreviousMqttCredentials,
  retryControllerNetworkChange,
  type NetworkChangeStatus,
} from '../api/client';
import { useWagoLiveQuery } from '../api/live-updates';
import { useWagoTranslations } from '../i18n';
import { NetworkChangeCredentialRetirement } from './NetworkChangeCredentialRetirement';
import { NetworkChangeOutcome } from './NetworkChangeOutcome';
import { NetworkChangeProgress } from './NetworkChangeProgress';
import { NetworkChangeTargetFields } from './NetworkChangeTargetFields';

/** Untouched fields follow fresh status; each deliberate edit survives refetches. */
function networkChangeFields(
  status: NetworkChangeStatus | undefined,
  editedTargetHost: string | undefined,
  editedServer: string | null | undefined,
) {
  const operation = status?.operation;
  const pending = !!operation && operation.phase !== 'completed';
  const editable = !pending || (operation?.phase === 'connecting' && !!operation.failure && !operation.running);
  const current = pending && operation ? operation : status;
  const targetHost = editedTargetHost ?? current?.targetHost ?? '';
  const server = editedServer !== undefined ? editedServer : String(current?.mqttServerId ?? 'address');
  return { pending, editable, targetHost, server };
}

export function NetworkChangeForm({ controllerId }: { controllerId: number }) {
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
  const { pending, editable, targetHost, server } = networkChangeFields(status, editedTargetHost, editedServer);
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
  const validHost = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(targetHost.trim());
  const selectedServer = servers.data?.find((item) => String(item.id) === server);

  return (
    <div className="wg:space-y-3">
      <h3>{t('networkChange.title')}</h3>
      <p>{t('networkChange.description')}</p>
      {statusQuery.isError ? (
        <p role="alert">{t('networkChange.statusUnavailable')}</p>
      ) : !status ? (
        <TableDataLoadingIndicator label={t('networkChange.loading')} />
      ) : !status.available ? (
        <p role="status">{t('networkChange.managementRequired')}</p>
      ) : (
        <>
          <NetworkChangeTargetFields
            targetHost={targetHost}
            onTargetHostChange={setTargetHost}
            server={server}
            onServerChange={setServer}
            servers={servers.data}
            serversError={servers.isError}
            isDisabled={busy || !editable}
          />
          {pending && (
            <NetworkChangeProgress phase={operation?.phase} busy={busy} onRetry={() => mutation.mutate('retry')} />
          )}
          <NetworkChangeOutcome operation={operation ?? null} actionFailed={mutation.isError} />
          {editable && (
            <Button
              isPending={mutation.isPending}
              isDisabled={busy || !validHost || !server || (server !== 'address' && !selectedServer)}
              onPress={() => mutation.mutate('apply')}
            >
              {t(server === 'address' ? 'networkChange.saveAddress' : 'networkChange.apply')}
            </Button>
          )}
        </>
      )}
      {!!status?.pendingCredentialRetirements && (
        <NetworkChangeCredentialRetirement
          isDisabled={busy || pending}
          onRetire={() => mutation.mutate('retire')}
          showActionError={!status.available && mutation.isError}
        />
      )}
    </div>
  );
}
