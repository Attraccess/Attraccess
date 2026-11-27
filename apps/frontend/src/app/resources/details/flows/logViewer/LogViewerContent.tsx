import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionPanel,
  AccordionBody,
  Chip,
  Separator,
  TextArea,
  ToggleButton,
} from '@heroui/react';
import { CircleDotIcon, CircleIcon, PartyPopperIcon } from 'lucide-react';
import { EmptyState, PageHeader, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowLog, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { useCallback, useMemo } from 'react';
import de from './de.json';
import en from './en.json';
import nodeTranslationsDe from '../node/de.json';
import nodeTranslationsEn from '../node/en.json';
import { useFlowContext, useFlowLogsContext } from '../context/index';
import { newestUniqueLogs } from './newestUniqueLogs';
import { DownloadLogsMenu } from './DownloadLogsMenu';
import { prettyPayload } from './prettyPayload';
import { triggerNodeOfRun } from './triggerNodeOfRun';
import { useFlowCanvasQuery, useFlowNodeSchemasQuery } from '../flowOwner';

interface LogViewerContentProps {
  /** Entries downloaded from the server's recording during this page visit. */
  recordedLogs: ResourceFlowLog[];
  isRecording: boolean;
  confettiEnabled: boolean;
  onConfettiEnabledChange: (enabled: boolean) => void;
}

/**
 * The open log drawer's body. It is the only part of the log viewer that reads the live entries, so a closed
 * drawer costs nothing while a busy flow streams entries.
 */
export function LogViewerContent(props: Readonly<LogViewerContentProps>) {
  const { recordedLogs, isRecording } = props;
  const { t, tExists } = useTranslations({
    de: { ...de, nodes: nodeTranslationsDe.nodes },
    en: { ...en, nodes: nodeTranslationsEn.nodes },
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
    const byRun = new Map<string, typeof logsOrdered>();
    for (const log of logsOrdered) {
      const logsOfRun = byRun.get(log.flowRunId);
      if (logsOfRun) logsOfRun.push(log);
      else byRun.set(log.flowRunId, [log]);
    }
    return [...byRun.entries()];
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-row flex-wrap items-center gap-2">
        {isRecording ? (
          <Chip color="danger" variant="soft" data-cy="flow-log-recording-chip">
            <CircleDotIcon aria-hidden className="w-4 h-4" />
            {t('recording.on')}
          </Chip>
        ) : (
          <Chip variant="soft" data-cy="flow-log-not-recording-chip">
            <CircleIcon aria-hidden className="w-4 h-4" />
            {t('recording.off')}
          </Chip>
        )}
        {/* Keyed by the recording state: the chip changes width then, and an open menu would be left misplaced. */}
        <DownloadLogsMenu key={String(isRecording)} owner={owner} logs={logsOrdered} nodeTitle={nodeTitle} />
      </div>

      <ToggleButton className="self-start" isSelected={props.confettiEnabled} onChange={props.onConfettiEnabledChange}>
        <PartyPopperIcon aria-hidden />
        {t('confetti')}
      </ToggleButton>

      {logsOrdered.length === 0 && <EmptyState message={emptyMessage} />}

      {logsByRunId.map(([runId, logsOfRun], index, self) => (
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
  );
}
