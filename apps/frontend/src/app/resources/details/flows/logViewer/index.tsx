import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionPanel,
  AccordionBody,
  Chip,
  Separator,
  DrawerBody,
  DrawerHeader,
  TextArea,
  ToggleButton,
  useOverlayState,
} from '@heroui/react';
import { CircleDotIcon, CircleIcon, PartyPopperIcon } from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  StandardDrawer,
  useDateTimeFormatter,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { ResourceFlowLog, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import de from './de.json';
import en from './en.json';
import nodeTranslationsDe from '../node/de.json';
import nodeTranslationsEn from '../node/en.json';
import { useFlowContext, useFlowLogsContext } from '../context/index';
import { newestUniqueLogs } from './newestUniqueLogs';
import { DownloadLogsMenu } from './DownloadLogsMenu';
import { prettyPayload } from './prettyPayload';
import { triggerNodeOfRun } from './triggerNodeOfRun';
import { useFlowCanvasQuery, useFlowLogRecording, useFlowNodeSchemasQuery } from '../flowOwner';

export interface Props {
  children: (open: () => void) => React.ReactNode;
  confettiEnabled: boolean;
  onConfettiEnabledChange: (enabled: boolean) => void;
}

export function LogViewer(props: Props) {
  const { isOpen, setOpen, open } = useOverlayState();

  const { t, tExists } = useTranslations({
    de: {
      ...de,
      nodes: nodeTranslationsDe.nodes,
    },
    en: {
      ...en,
      nodes: nodeTranslationsEn.nodes,
    },
  });

  const { owner } = useFlowContext();
  const { liveLogs: sseLogs, isPausedForInactivity } = useFlowLogsContext();

  const { data: flowData } = useFlowCanvasQuery(owner);
  const { data: nodeSchemas } = useFlowNodeSchemasQuery(owner);

  const nodeTitle = useCallback(
    (node?: ResourceFlowNodeDto) => {
      const nodeType = node?.type ?? 'flow';
      const titleKey = 'nodes.' + nodeType + '.title';
      if (tExists(titleKey)) {
        return t(titleKey);
      }

      return nodeSchemas?.find((schema) => schema.type === nodeType)?.label ?? nodeType;
    },
    [nodeSchemas, t, tExists],
  );

  // The editor keeps the recording alive (FlowLogsProvider); the status is polled while the drawer is open to
  // notice when it expires. Status only — polling the logs endpoint would re-ship the whole buffer every tick.
  const { recording, isRecording, logs } = useFlowLogRecording(owner, { isOpen });

  const [recordedLogs, setRecordedLogs] = useState<ResourceFlowLog[]>([]);
  const fetchedLogs = logs;
  const recordingStartedAt = recording?.startedAt;

  // The server discards its buffer when the recording expires. Keep downloaded entries for this page visit;
  // the SSE buffer already lasts for the lifetime of the flow page.
  useEffect(() => {
    if (!isRecording || !recordingStartedAt || !fetchedLogs?.length) return;

    const recordingStart = new Date(recordingStartedAt).getTime();
    const currentLogs = fetchedLogs.filter((log) => new Date(log.createdAt).getTime() >= recordingStart);
    if (!currentLogs.length) return;

    setRecordedLogs((previous) => newestUniqueLogs([...previous, ...currentLogs]));
  }, [fetchedLogs, isRecording, recordingStartedAt]);

  // Newest first.
  const logsOrdered = useMemo(() => {
    const nodesById = new Map((flowData?.nodes ?? []).map((node) => [node.id, node]));
    return newestUniqueLogs([...recordedLogs, ...sseLogs])
      .reverse()
      .map((log) => {
        const nodeOfLog = log.nodeId ? nodesById.get(log.nodeId) : undefined;
        return {
          ...log,
          node: nodeOfLog,
          title: `${nodeTitle(nodeOfLog)} -> ${log.type}`,
        };
      });
  }, [flowData, recordedLogs, sseLogs, nodeTitle]);

  const logsByRunId = useMemo(() => {
    return (logsOrdered ?? []).reduce(
      (acc, log) => {
        acc[log.flowRunId] = [...(acc[log.flowRunId] ?? []), log];
        return acc;
      },
      {} as Record<string, (ResourceFlowLog & { node: ResourceFlowNodeDto | undefined; title: string })[]>,
    );
  }, [logsOrdered]);

  const formatDateTime = useDateTimeFormatter({
    showSeconds: true,
  });

  const runHeader = useCallback(
    (logsOfRun: typeof logsOrdered) => {
      return {
        title: nodeTitle(triggerNodeOfRun(logsOfRun)),
        subtitle: formatDateTime(logsOfRun[logsOfRun.length - 1]?.createdAt),
      };
    },
    [nodeTitle, formatDateTime],
  );

  const emptyMessage = isPausedForInactivity
    ? t('recording.paused')
    : isRecording
      ? t('recording.waiting')
      : t('recording.starting');

  return (
    <>
      {props.children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen} dialogProps={{ 'aria-label': t('title') }}>
        <DrawerHeader>
          <PageHeader title={t('title')} subtitle={t('subtitle')} noMargin />
        </DrawerHeader>

        <DrawerBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-row flex-wrap items-center gap-2">
              {isRecording ? (
                <Chip color="danger" variant="soft" data-cy="flow-log-recording-chip">
                  <CircleDotIcon className="w-4 h-4" />
                  {t('recording.on')}
                </Chip>
              ) : (
                <Chip variant="soft" data-cy="flow-log-not-recording-chip">
                  <CircleIcon className="w-4 h-4" />
                  {t('recording.off')}
                </Chip>
              )}
              {/* Keyed by the recording state: the row changes height then, and an open menu would cover its button. */}
              <DownloadLogsMenu key={String(isRecording)} owner={owner} logs={logsOrdered} nodeTitle={nodeTitle} />
            </div>

            <ToggleButton
              className="self-start"
              isSelected={props.confettiEnabled}
              onChange={props.onConfettiEnabledChange}
            >
              <PartyPopperIcon />
              {t('confetti')}
            </ToggleButton>

            {logsOrdered.length === 0 && <EmptyState message={emptyMessage} />}

            {Object.entries(logsByRunId).map(([runId, logsOfRun], index, self) => (
              <div key={`${runId}-logs`}>
                <div>
                  <PageHeader {...runHeader(logsOfRun)} noMargin />

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
