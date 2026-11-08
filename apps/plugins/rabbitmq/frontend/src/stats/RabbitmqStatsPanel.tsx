// Broker stats for the MQTT server detail slot (ATT-524): overview totals, the
// cluster nodes and the queues. Every figure may be missing on older brokers.
import { Button, EmptyState, StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import {
  Card,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { BarChart3Icon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Duration, MISSING_VALUE, useRabbitmqFormatters } from '../format';
import { useRabbitmqTranslations } from '../i18n';
import { usePolledResource } from '../usePolledResource';
import { fetchStats, type RabbitmqNode } from './stats-api';

export const STATS_POLL_INTERVAL_MS = 15_000;

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rmq:flex rmq:flex-col rmq:rounded-lg rmq:border rmq:border-default-200 rmq:dark:border-default-100 rmq:p-3">
      <span className="rmq:text-xs rmq:text-default-500">{label}</span>
      <span className="rmq:text-lg rmq:font-semibold rmq:text-default-700">{value}</span>
    </div>
  );
}

function Alarm({ alarm, children }: { alarm: boolean | null; children: ReactNode }) {
  const { t } = useRabbitmqTranslations();
  return (
    <span className="rmq:flex rmq:items-center rmq:gap-1 rmq:whitespace-nowrap">
      {children}
      {alarm === true && (
        <Chip size="sm" color="danger" variant="soft">
          <TriangleAlertIcon className="rmq:w-3 rmq:h-3" aria-hidden />
          {t('stats.alarm')}
        </Chip>
      )}
    </span>
  );
}

export function RabbitmqStatsPanel({ mqttServerId }: { mqttServerId: number }) {
  const { t } = useRabbitmqTranslations();
  const format = useRabbitmqFormatters();
  const ratio = (used: number | null, total: number | null) =>
    used === null ? MISSING_VALUE : `${format.number(used)} / ${format.number(total)}`;
  const { data, error, loading, reload } = usePolledResource(
    () => fetchStats(mqttServerId),
    STATS_POLL_INTERVAL_MS,
    t('stats.loadError'),
  );
  const overview = data?.overview;

  return (
    <Card
      data-cy={`rabbitmq-stats-panel-${mqttServerId}`}
      className="rmq:w-full rmq:border rmq:border-default-200 rmq:dark:border-default-100"
    >
      <Card.Header className="rmq:flex rmq:flex-row rmq:items-center rmq:justify-between rmq:gap-2">
        <div className="rmq:flex rmq:items-center rmq:gap-2">
          <BarChart3Icon className="rmq:w-5 rmq:h-5 rmq:text-accent-soft-foreground" />
          <p className="rmq:text-base rmq:font-semibold rmq:text-default-700">{t('stats.title')}</p>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t('stats.reload')}
          onPress={() => void reload()}
          isPending={loading}
          data-cy={`rabbitmq-stats-reload-${mqttServerId}`}
        >
          <RefreshCwIcon className="rmq:w-4 rmq:h-4" />
        </Button>
      </Card.Header>
      <Card.Content className="rmq:flex rmq:flex-col rmq:gap-4">
        {error && (
          <StatusAlert status="danger" title={t('stats.loadError')} data-cy="rabbitmq-stats-error-alert">
            {error === t('stats.loadError') ? undefined : error}
          </StatusAlert>
        )}
        {!data && !error && <TableDataLoadingIndicator />}
        {overview && (
          <>
            <div className="rmq:grid rmq:grid-cols-2 rmq:md:grid-cols-4 rmq:gap-3" data-cy="rabbitmq-stats-overview">
              <Stat label={t('stats.version')} value={overview.rabbitmqVersion ?? MISSING_VALUE} />
              <Stat label={t('stats.erlang')} value={overview.erlangVersion ?? MISSING_VALUE} />
              <Stat label={t('stats.cluster')} value={overview.clusterName ?? MISSING_VALUE} />
              <Stat label={t('stats.connections')} value={format.number(overview.connections)} />
              <Stat label={t('stats.channels')} value={format.number(overview.channels)} />
              <Stat label={t('stats.queues')} value={format.number(overview.queues)} />
              <Stat label={t('stats.consumers')} value={format.number(overview.consumers)} />
              <Stat label={t('stats.ready')} value={format.number(overview.messagesReady)} />
              <Stat label={t('stats.unacked')} value={format.number(overview.messagesUnacknowledged)} />
              <Stat label={t('stats.publishRate')} value={format.rate(overview.publishRate, '/s')} />
              <Stat label={t('stats.deliverRate')} value={format.rate(overview.deliverRate, '/s')} />
            </div>

            <p className="rmq:text-sm rmq:font-semibold rmq:text-default-700">{t('stats.nodes')}</p>
            {data.nodes.length === 0 ? (
              <EmptyState message={t('stats.noNodes')} />
            ) : (
              <Table data-cy="rabbitmq-stats-nodes-table">
                <TableScrollContainer>
                  <TableContent aria-label={t('stats.nodes')}>
                    <TableHeader>
                      <TableColumn isRowHeader>{t('stats.nodeName')}</TableColumn>
                      <TableColumn>{t('stats.running')}</TableColumn>
                      <TableColumn>{t('stats.memory')}</TableColumn>
                      <TableColumn>{t('stats.disk')}</TableColumn>
                      <TableColumn>{t('stats.fileDescriptors')}</TableColumn>
                      <TableColumn>{t('stats.sockets')}</TableColumn>
                      <TableColumn>{t('stats.uptime')}</TableColumn>
                    </TableHeader>
                    <TableBody items={data.nodes}>
                      {(node: RabbitmqNode) => (
                        <TableRow key={node.name} id={node.name}>
                          <TableCell className="rmq:font-medium">{node.name}</TableCell>
                          <TableCell>
                            {node.running === null ? MISSING_VALUE : node.running ? t('common.yes') : t('common.no')}
                          </TableCell>
                          <TableCell>
                            <Alarm alarm={node.memAlarm}>
                              {format.bytes(node.memUsed)} / {format.bytes(node.memLimit)}
                            </Alarm>
                          </TableCell>
                          <TableCell>
                            <Alarm alarm={node.diskFreeAlarm}>
                              {format.bytes(node.diskFree)} / {format.bytes(node.diskFreeLimit)}
                            </Alarm>
                          </TableCell>
                          <TableCell>{ratio(node.fdUsed, node.fdTotal)}</TableCell>
                          <TableCell>{ratio(node.socketsUsed, node.socketsTotal)}</TableCell>
                          <TableCell className="rmq:whitespace-nowrap">
                            <Duration ms={node.uptime} />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </TableContent>
                </TableScrollContainer>
              </Table>
            )}

            <p className="rmq:text-sm rmq:font-semibold rmq:text-default-700">{t('stats.queueList')}</p>
            {data.queues.length === 0 ? (
              <EmptyState message={t('stats.noQueues')} />
            ) : (
              <Table data-cy="rabbitmq-stats-queues-table">
                <TableScrollContainer>
                  <TableContent aria-label={t('stats.queueList')}>
                    <TableHeader>
                      <TableColumn isRowHeader>{t('stats.queueName')}</TableColumn>
                      <TableColumn>{t('stats.vhost')}</TableColumn>
                      <TableColumn>{t('stats.type')}</TableColumn>
                      <TableColumn>{t('stats.ready')}</TableColumn>
                      <TableColumn>{t('stats.unacked')}</TableColumn>
                      <TableColumn>{t('stats.consumers')}</TableColumn>
                      <TableColumn>{t('common.state')}</TableColumn>
                    </TableHeader>
                    <TableBody items={data.queues}>
                      {(queue) => (
                        <TableRow
                          key={JSON.stringify([queue.vhost, queue.name])}
                          id={JSON.stringify([queue.vhost, queue.name])}
                        >
                          <TableCell className="rmq:font-medium">{queue.name}</TableCell>
                          <TableCell>{queue.vhost}</TableCell>
                          <TableCell>{queue.type ?? MISSING_VALUE}</TableCell>
                          <TableCell>{format.number(queue.messagesReady)}</TableCell>
                          <TableCell>{format.number(queue.messagesUnacknowledged)}</TableCell>
                          <TableCell>{format.number(queue.consumers)}</TableCell>
                          <TableCell>{queue.state ?? MISSING_VALUE}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </TableContent>
                </TableScrollContainer>
              </Table>
            )}
            {data.totalQueues > data.queues.length && (
              <StatusAlert status="warning">{t('stats.queuesTruncated', { total: data.totalQueues })}</StatusAlert>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}
