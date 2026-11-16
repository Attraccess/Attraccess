import { Button, StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { Description, Input, Label, ListBox, ProgressBar, Select, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  changeControllerNetwork,
  getNetworkChangeStatus,
  listMqttServers,
  retirePreviousMqttCredentials,
  retryControllerNetworkChange,
} from '../api/client';
import { useWagoLiveQuery } from '../api/live-updates';
import { useWagoTranslations } from '../i18n';
import messages from '../network-change.en.json';

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
          <TextField value={targetHost} onChange={setTargetHost} isDisabled={busy || !editable}>
            <Label>{t('networkChange.address')}</Label>
            <Input autoComplete="off" placeholder="192.168.1.10" />
            <Description>{t('networkChange.addressDescription')}</Description>
          </TextField>
          <Select
            value={server}
            onChange={(value) => setServer(value === null ? null : String(value))}
            isDisabled={busy || !editable}
          >
            <Label>{t('networkChange.server')}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="address" textValue={t('networkChange.addressOnly')}>
                  {t('networkChange.addressOnly')}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {(servers.data ?? []).map((item) => (
                  <ListBox.Item key={item.id} id={String(item.id)} textValue={item.name}>
                    {item.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
            <Description>{t('networkChange.refreshDescription')}</Description>
          </Select>
          {selectedServer && (
            <p>
              {selectedServer.host}:{selectedServer.port}
            </p>
          )}
          {servers.isError && <p role="alert">{t('networkChange.serversUnavailable')}</p>}
          {pending && (
            <>
              {busy ? (
                <ProgressBar isIndeterminate size="sm">
                  <Label>{t(`networkChange.phases.${operation?.phase ?? 'connecting'}`)}</Label>
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              ) : (
                <p role="status">{t('networkChange.retryDescription')}</p>
              )}
              <Button variant="secondary" isDisabled={busy} onPress={() => mutation.mutate('retry')}>
                {t('networkChange.retry')}
              </Button>
            </>
          )}
          {failure && (
            <StatusAlert status="danger" title={t('networkChange.failed')}>
              {t(`networkChange.failures.${Object.hasOwn(messages.failures, failure) ? failure : 'unknown'}`)}
            </StatusAlert>
          )}
          {mutation.isError && !failure && <p role="alert">{t('networkChange.actionFailed')}</p>}
          {operation?.phase === 'completed' && (
            <StatusAlert
              status="success"
              title={t(operation.mqttServerId === null ? 'networkChange.addressSuccess' : 'networkChange.success')}
            />
          )}
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
        <>
          <p>{t('networkChange.retirementDescription')}</p>
          <Button variant="secondary" isDisabled={busy || pending} onPress={() => mutation.mutate('retire')}>
            {t('networkChange.retire')}
          </Button>
          {!status.available && mutation.isError && <p role="alert">{t('networkChange.actionFailed')}</p>}
        </>
      )}
    </div>
  );
}
