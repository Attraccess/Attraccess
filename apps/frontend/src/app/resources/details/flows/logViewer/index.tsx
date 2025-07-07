import { Divider, Drawer, DrawerBody, DrawerContent, DrawerHeader, Textarea, useDisclosure } from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ResourceFlowLog,
  ResourceFlowNodeDto,
  useResourceFlowsServiceGetResourceFlow,
  useResourceFlowsServiceGetResourceFlowLogs,
} from '@attraccess/react-query-client';
import { useCallback, useMemo, useState } from 'react';
import { getBaseUrl } from '../../../../../api';
import { useAuth } from '../../../../../hooks/useAuth';
import { useSSEQuery } from '../../../../../api/useSSEQuery';
import { InfoIcon, LogsIcon } from 'lucide-react';
import { Accordion } from '../../../../../components/accordion';

import de from './de.json';
import en from './en.json';

import nodeTranslationsDe from '../nodes/de.json';
import nodeTranslationsEn from '../nodes/en.json';

interface Props {
  children: (open: () => void) => React.ReactNode;
  resourceId: number;
}

export function LogViewer(props: Props) {
  const { isOpen, onOpenChange, onOpen, onClose } = useDisclosure();

  const { t } = useTranslations('resources.details.flows.logViewer', {
    de: {
      ...de,
      nodes: nodeTranslationsDe,
    },
    en: {
      ...en,
      nodes: nodeTranslationsEn,
    },
  });

  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);

  const { token: authToken } = useAuth();

  const { data: sseLogs } = useSSEQuery<ResourceFlowLog>({
    queryKey: ['resource-flow-logs', props.resourceId],
    url: `${getBaseUrl()}/api/resources/${props.resourceId}/flow/logs/live`,
    init: {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
    queryOptions: {
      enabled: !!authToken,
    },
  });

  const { data: flowData } = useResourceFlowsServiceGetResourceFlow({ resourceId: props.resourceId });
  const { data: logs } = useResourceFlowsServiceGetResourceFlowLogs({ limit, page, resourceId: props.resourceId });

  const logsWithNodes = useMemo(() => {
    const allLogs = [...(logs?.data ?? []), ...(sseLogs ?? [])];

    return allLogs.map((log) => {
      const nodeOfLog = flowData?.nodes.find((node) => node.id === log.nodeId);
      return {
        ...log,
        node: nodeOfLog,
      };
    });
  }, [flowData, logs, sseLogs]);

  const logsOrdered = useMemo(() => {
    // descending by id
    return logsWithNodes.sort((a, b) => a.id - b.id);
  }, [logsWithNodes]);

  const logsByRunId = useMemo(() => {
    return (logsOrdered ?? []).reduce((acc, log) => {
      acc[log.flowRunId] = [...(acc[log.flowRunId] ?? []), log];
      return acc;
    }, {} as Record<string, (ResourceFlowLog & { node: ResourceFlowNodeDto | undefined })[]>);
  }, [logsOrdered]);

  const firstNodeOfRun = useCallback(
    (runId: string) => {
      const logsOfRun = logsOrdered.filter((log) => log.flowRunId === runId);
      return logsOfRun[0];
    },
    [logsOrdered]
  );

  const formatDateTime = useDateTimeFormatter({
    showSeconds: true,
  });

  return (
    <>
      {props.children(onOpen)}
      <Drawer isOpen={isOpen} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <PageHeader title={t('title')} noMargin />
          </DrawerHeader>

          <DrawerBody>
            <div className="flex flex-col gap-4">
              {Object.entries(logsByRunId).map(([runId, logsOfRun], index, self) => (
                <div key={`${runId}-logs`}>
                  <div>
                    <PageHeader
                      title={t('nodes.' + firstNodeOfRun(runId)?.node?.type + '.title')}
                      subtitle={formatDateTime(firstNodeOfRun(runId)?.createdAt)}
                      noMargin
                    />

                    <Accordion
                      items={logsOfRun}
                      itemKey={(log) => `${runId}-${log.id}`}
                      itemTitle={(log) => `${t('nodes.' + log.node?.type + '.title')} -> ${log.type}`}
                      variant="flat"
                      className="mt-2"
                    >
                      {(log) => (
                        <>
                          {log.payload && (
                            <Textarea isReadOnly value={JSON.stringify(JSON.parse(log.payload), null, 2)} />
                          )}
                        </>
                      )}
                    </Accordion>
                  </div>
                  {index < self.length - 1 && <Divider className="my-4" />}
                </div>
              ))}
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
