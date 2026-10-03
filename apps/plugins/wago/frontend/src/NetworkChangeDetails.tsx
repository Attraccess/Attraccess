import {
  Accordion,
  Alert,
  Button,
  Description,
  Input,
  Label,
  ListBox,
  ProgressBar,
  Select,
  TextField,
} from '@heroui/react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeControllerNetwork,
  getNetworkChangeStatus,
  listMqttServers,
  retirePreviousMqttCredentials,
  retryControllerNetworkChange,
} from './api';
import { useWagoTranslations } from './i18n';
import messages from './network-change.en.json';

export function NetworkChangeDetails({ controllerId }: { controllerId: number }) {
  const { t } = useWagoTranslations();
  const [expanded, setExpanded] = useState(false);
  return (
    <Accordion>
      <Accordion.Item onExpandedChange={setExpanded}>
        <Accordion.Heading>
          <Accordion.Trigger>
            {t('networkChange.advanced')}
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            {expanded && <NetworkChangeForm key={controllerId} controllerId={controllerId} />}
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

export function NetworkChangeForm({ controllerId }: { controllerId: number }) {
  const { t } = useWagoTranslations(),
    client = useQueryClient();
  const queryKey = ['wago', 'network-change', controllerId];
  const statusQuery = useQuery({
    queryKey,
    queryFn: () => getNetworkChangeStatus(controllerId),
    refetchInterval: 2000,
    retry: false,
  });
  const servers = useQuery({ queryKey: ['mqtt', 'servers'], queryFn: listMqttServers, retry: false });
  const [targetHost, setTargetHost] = useState(''),
    [server, setServer] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const status = statusQuery.data,
    operation = status?.operation;
  const pending = !!operation && operation.phase !== 'completed';
  const editable = !pending || (operation?.phase === 'connecting' && !!operation.failure && !operation.running);
  useEffect(() => {
    if (!status || initialized) return;
    setTargetHost(pending && operation ? operation.targetHost : (status.targetHost ?? ''));
    setServer(String((pending && operation ? operation.mqttServerId : status.mqttServerId) ?? 'address'));
    setInitialized(true);
  }, [initialized, operation, pending, status]);
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
        <p role="status">{t('networkChange.loading')}</p>
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
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{t('networkChange.failed')}</Alert.Title>
                <Alert.Description>
                  {t(`networkChange.failures.${Object.hasOwn(messages.failures, failure) ? failure : 'unknown'}`)}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {mutation.isError && !failure && <p role="alert">{t('networkChange.actionFailed')}</p>}
          {operation?.phase === 'completed' && (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t(operation.mqttServerId === null ? 'networkChange.addressSuccess' : 'networkChange.success')}
                </Alert.Title>
              </Alert.Content>
            </Alert>
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
