import {
  Accordion,
  AccordionItem,
  Code,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ResourceFlowLog,
  ResourceFlowNodeDto,
  useResourceFlowsServiceGetResourceFlow,
  useResourceFlowsServiceGetResourceFlowLogs,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBaseUrl } from '../../../../../api';
import { useAuth } from '../../../../../hooks/useAuth';
import { events } from 'fetch-event-stream';

import de from './de.json';
import en from './en.json';

import nodeTranslationsDe from '../nodes/de.json';
import nodeTranslationsEn from '../nodes/en.json';
import { InfoIcon, LogsIcon } from 'lucide-react';

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

  const [sseLogs, setSseLogs] = useState<ResourceFlowLog[]>([]);

  const { token: authToken } = useAuth();

  const startListeningToLogs = useCallback(async () => {
    console.log('startListeningToLogs', authToken);

    if (!authToken) {
      return null;
    }

    const url = `${getBaseUrl()}/api/resources/${props.resourceId}/flow/logs/live`;

    const abort = new AbortController();

    // Manually fetch a Response
    const res = await fetch(url, {
      method: 'GET',
      signal: abort.signal,
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (res.ok) {
      const stream = events(res, abort.signal);
      for await (const event of stream) {
        const data = JSON.parse(event.data as string);
        if (data.keepalive) {
          continue;
        }

        console.log('new log: ', data);

        setSseLogs((prev) => [...prev, data]);
      }
    }

    return abort;
  }, [props.resourceId, authToken]);

  useEffect(() => {
    const ctrl = startListeningToLogs();
    return () => {
      ctrl?.then((ctrl) => ctrl?.abort());
    };
  }, [startListeningToLogs]);

  const { data: flowData } = useResourceFlowsServiceGetResourceFlow({ resourceId: props.resourceId });
  const { data: logs } = useResourceFlowsServiceGetResourceFlowLogs({ limit, page, resourceId: props.resourceId });

  const logsWithNodes = useMemo(() => {
    const allLogs = [...(logs?.data ?? []), ...sseLogs];
    console.log('allLogs: ', allLogs.length);
    return allLogs.map((log) => {
      const nodeOfLog = flowData?.nodes.find((node) => node.id === log.nodeId);
      return {
        ...log,
        node: nodeOfLog,
      };
    });
  }, [flowData, logs, sseLogs]);

  const logsOrdered = useMemo(() => {
    // decending by createdAt
    return logsWithNodes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
                <>
                  <div key={runId}>
                    <PageHeader
                      title={t('nodes.' + firstNodeOfRun(runId)?.node?.type + '.title')}
                      subtitle={formatDateTime(firstNodeOfRun(runId)?.createdAt)}
                      noMargin
                    />
                    <Accordion isCompact className="mt-2">
                      {logsOfRun.map((log) => (
                        <AccordionItem
                          key={`${runId}-${log.id}`}
                          title={`${t('nodes.' + log.node?.type + '.title')} -> ${log.type}`}
                          indicator={log.payload ? <LogsIcon /> : <InfoIcon className="hidden" />}
                        >
                          {log.payload && <Textarea isReadOnly value={JSON.stringify(log.payload, null, 2)} />}
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                  {index < self.length - 1 && <Divider className="my-4" />}
                </>
              ))}
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
