import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionPanel,
  AccordionBody,
  Button,
  Chip,
  Separator,
  DrawerBody,
  DrawerHeader,
  TextArea,
  useOverlayState,
} from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { EmptyState } from '../../../../../components/emptyState';
import { Select } from '../../../../../components/select';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ResourceFlowLog,
  ResourceFlowNodeDto,
  useResourceFlowsServiceGetResourceFlow,
  useResourceFlowsServiceGetResourceFlowLogs,
  useResourceFlowsServiceGetResourceFlowLogsKey,
  useResourceFlowsServiceStartFlowLogRecording,
  useResourceFlowsServiceStopFlowLogRecording,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { CircleStopIcon, CircleDotIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import de from './de.json';
import en from './en.json';

import nodeTranslationsDe from '../node/de.json';
import nodeTranslationsEn from '../node/en.json';
import { useFlowContext } from '../flowContext';

interface Props {
  children: (open: () => void) => React.ReactNode;
  resourceId: number;
}

const DURATION_OPTIONS = [
  { minutes: 15, labelKey: 'duration.m15' },
  { minutes: 30, labelKey: 'duration.m30' },
  { minutes: 60, labelKey: 'duration.h1' },
  { minutes: 240, labelKey: 'duration.h4' },
  { minutes: 480, labelKey: 'duration.h8' },
  { minutes: 1440, labelKey: 'duration.h24' },
];
const DEFAULT_DURATION_MINUTES = '15';

// Payloads over the recorder's limit arrive truncated, so they are no longer valid JSON.
export function prettyPayload(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function useCountdown(until: Date | string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) {
      return;
    }

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [until]);

  if (!until) {
    return null;
  }

  const remainingSeconds = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function LogViewer(props: Props) {
  const { isOpen, setOpen, open } = useOverlayState();

  const { t } = useTranslations({
    de: {
      ...de,
      nodes: nodeTranslationsDe.nodes,
    },
    en: {
      ...en,
      nodes: nodeTranslationsEn.nodes,
    },
  });

  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);

  const { liveLogs: sseLogs } = useFlowContext();
  const queryClient = useQueryClient();

  const { data: flowData } = useResourceFlowsServiceGetResourceFlow({ resourceId: props.resourceId });
  const { data: logs } = useResourceFlowsServiceGetResourceFlowLogs(
    { resourceId: props.resourceId },
    undefined,
    // Recording expires on its own; poll while the drawer is open to notice.
    { refetchInterval: isOpen ? 10_000 : false },
  );

  const invalidateLogs = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [useResourceFlowsServiceGetResourceFlowLogsKey] }),
    [queryClient],
  );

  const { mutate: startRecording, isPending: isStarting } = useResourceFlowsServiceStartFlowLogRecording({
    onSuccess: invalidateLogs,
  });
  const { mutate: stopRecording, isPending: isStopping } = useResourceFlowsServiceStopFlowLogRecording({
    onSuccess: invalidateLogs,
  });

  const isRecording = logs?.recording.isRecording ?? false;
  const countdown = useCountdown(isRecording ? logs?.recording.expiresAt : null);

  const logsWithNodes = useMemo(() => {
    if (!isRecording) {
      return [];
    }

    // The SSE stream accumulates for the lifetime of the page, so drop anything
    // that predates the running recording — those logs are already deleted.
    const recordingStart = new Date(logs?.recording.startedAt ?? 0).getTime();
    const allLogs = [...(logs?.logs ?? []), ...(sseLogs ?? [])].filter(
      (log) => new Date(log.createdAt).getTime() >= recordingStart,
    );
    const uniqueLogs = [...new Map(allLogs.map((log) => [log.id, log])).values()];

    return uniqueLogs.map((log) => {
      const nodeOfLog = flowData?.nodes.find((node) => node.id === log.nodeId);

      return {
        ...log,
        node: nodeOfLog,
        title: `${t('nodes.' + (nodeOfLog?.type ?? 'flow') + '.title')} -> ${log.type}`,
      };
    });
  }, [flowData, logs, sseLogs, t, isRecording]);

  const logsOrdered = useMemo(() => {
    return [...logsWithNodes].sort((a, b) => b.id - a.id);
  }, [logsWithNodes]);

  const logsByRunId = useMemo(() => {
    return (logsOrdered ?? []).reduce(
      (acc, log) => {
        acc[log.flowRunId] = [...(acc[log.flowRunId] ?? []), log];
        return acc;
      },
      {} as Record<string, (ResourceFlowLog & { node: ResourceFlowNodeDto | undefined; title: string })[]>,
    );
  }, [logsOrdered]);

  const firstNodeOfRun = useCallback(
    (runId: string) => {
      const logsOfRun = logsOrdered.filter((log) => log.flowRunId === runId);
      return logsOfRun[logsOfRun.length - 1];
    },
    [logsOrdered],
  );

  const formatDateTime = useDateTimeFormatter({
    showSeconds: true,
  });

  const durationItems = useMemo(
    () => DURATION_OPTIONS.map(({ minutes, labelKey }) => ({ key: String(minutes), label: t(labelKey) })),
    [t],
  );

  return (
    <>
      {props.children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <PageHeader title={t('title')} subtitle={t('subtitle')} noMargin />
        </DrawerHeader>

        <DrawerBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-row flex-wrap items-end gap-2">
              {isRecording ? (
                <>
                  <Chip color="danger" variant="soft" data-cy="flow-log-recording-chip">
                    <CircleDotIcon className="w-4 h-4" />
                    {t('recording.active', { countdown: countdown ?? '' })}
                  </Chip>
                  <Button
                    variant="danger"
                    isPending={isStopping}
                    onPress={() => stopRecording({ resourceId: props.resourceId })}
                    data-cy="flow-log-stop-recording"
                  >
                    <CircleStopIcon className="w-4 h-4" />
                    {t('recording.stop')}
                  </Button>
                </>
              ) : (
                <>
                  <Select
                    label={t('recording.duration')}
                    items={durationItems}
                    value={durationMinutes}
                    onChange={setDurationMinutes}
                    className="min-w-40"
                    data-cy="flow-log-duration-select"
                  />
                  <Button
                    variant="primary"
                    isPending={isStarting}
                    onPress={() =>
                      startRecording({
                        resourceId: props.resourceId,
                        requestBody: { durationMinutes: Number(durationMinutes) },
                      })
                    }
                    data-cy="flow-log-start-recording"
                  >
                    <CircleDotIcon className="w-4 h-4" />
                    {t('recording.start')}
                  </Button>
                </>
              )}
            </div>

            {!isRecording && <EmptyState message={t('recording.hint')} />}
            {isRecording && logsOrdered.length === 0 && <EmptyState message={t('recording.waiting')} />}

            {Object.entries(logsByRunId).map(([runId, logsOfRun], index, self) => (
              <div key={`${runId}-logs`}>
                <div>
                  <PageHeader
                    title={t('nodes.' + (firstNodeOfRun(runId)?.node?.type ?? 'flow') + '.title')}
                    subtitle={formatDateTime(firstNodeOfRun(runId)?.createdAt)}
                    noMargin
                  />

                  <Accordion className="mt-2">
                    {logsOfRun.map((log) => (
                      <AccordionItem key={`${runId}-${log.id}`} id={`${runId}-${log.id}`}>
                        <AccordionHeading>
                          <AccordionTrigger>{log.title}</AccordionTrigger>
                        </AccordionHeading>
                        <AccordionPanel>
                          <AccordionBody>
                            {log.payload && (
                              <TextArea
                                readOnly
                                rows={16}
                                className="font-mono text-sm w-full"
                                value={prettyPayload(log.payload)}
                              />
                            )}
                          </AccordionBody>
                        </AccordionPanel>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
                {index < self.length - 1 && <Separator className="my-4" />}
              </div>
            ))}
          </div>
        </DrawerBody>
      </StandardDrawer>
    </>
  );
}
