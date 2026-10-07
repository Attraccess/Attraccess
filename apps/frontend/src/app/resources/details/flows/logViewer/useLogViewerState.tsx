import { useOverlayState } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ResourceFlowLog,
  ResourceFlowNodeDto,
  useResourceFlowsServiceGetNodeSchemas,
  useResourceFlowsServiceGetFlowLogRecordingStatus,
  useResourceFlowsServiceGetFlowLogRecordingStatusKey,
  useResourceFlowsServiceGetResourceFlow,
  useResourceFlowsServiceGetResourceFlowLogs,
  useResourceFlowsServiceStartFlowLogRecording,
  useResourceFlowsServiceStopFlowLogRecording,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import de from './de.json';
import en from './en.json';
import nodeTranslationsDe from '../node/de.json';
import nodeTranslationsEn from '../node/en.json';
import { useFlowContext } from '../flowContext';
import { Props } from './index.props';
import { DURATION_OPTIONS } from './index.state';
import { DEFAULT_DURATION_MINUTES } from './index.state';
import { triggerNodeOfRun } from './index.helpers';
import { useCountdown } from './index.helpers';
export function useLogViewerState(props: Props) {
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

  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);

  const { liveLogs: sseLogs } = useFlowContext();
  const queryClient = useQueryClient();

  const { data: flowData } = useResourceFlowsServiceGetResourceFlow({ resourceId: props.resourceId });
  const { data: nodeSchemas } = useResourceFlowsServiceGetNodeSchemas({ resourceId: props.resourceId });

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

  // Recording expires on its own; poll while the drawer is open to notice. Status only —
  // polling the logs endpoint would re-ship the whole buffer every tick.
  const { data: recording } = useResourceFlowsServiceGetFlowLogRecordingStatus(
    { resourceId: props.resourceId },
    undefined,
    { refetchInterval: isOpen ? 10_000 : false },
  );

  const isRecording = recording?.isRecording ?? false;

  // Fetched once per recording to pick up whatever was collected before the drawer opened;
  // everything after that arrives over SSE, so this never refetches.
  const { data: logs } = useResourceFlowsServiceGetResourceFlowLogs(
    { resourceId: props.resourceId },
    // The generated key defaults to [{ resourceId }]; startedAt makes it per-recording.
    [{ resourceId: props.resourceId }, recording?.startedAt],
    { enabled: isOpen && isRecording, refetchInterval: false, staleTime: Infinity },
  );

  // Only the status needs invalidating: starting changes startedAt, which is part of the
  // logs query key, and stopping disables that query altogether.
  const invalidateStatus = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [useResourceFlowsServiceGetFlowLogRecordingStatusKey] }),
    [queryClient],
  );

  const { mutate: startRecording, isPending: isStarting } = useResourceFlowsServiceStartFlowLogRecording({
    onSuccess: invalidateStatus,
  });
  const { mutate: stopRecording, isPending: isStopping } = useResourceFlowsServiceStopFlowLogRecording({
    onSuccess: invalidateStatus,
  });

  const countdown = useCountdown(isRecording ? recording?.expiresAt : null);

  const [recordedLogs, setRecordedLogs] = useState<ResourceFlowLog[]>([]);
  const fetchedLogs = logs?.logs;
  const recordingStartedAt = recording?.startedAt;

  // The server discards its buffer on stop. Keep downloaded entries for this page visit;
  // the SSE buffer already lasts for the lifetime of the flow page.
  useEffect(() => {
    if (!isRecording || !recordingStartedAt || !fetchedLogs?.length) return;

    const recordingStart = new Date(recordingStartedAt).getTime();
    const currentLogs = fetchedLogs.filter((log) => new Date(log.createdAt).getTime() >= recordingStart);
    if (!currentLogs.length) return;

    setRecordedLogs((previous) => [...new Map([...previous, ...currentLogs].map((log) => [log.id, log])).values()]);
  }, [fetchedLogs, isRecording, recordingStartedAt]);

  const logsWithNodes = useMemo(() => {
    const allLogs = [...recordedLogs, ...(sseLogs ?? [])];
    const uniqueLogs = [...new Map(allLogs.map((log) => [log.id, log])).values()];

    return uniqueLogs.map((log) => {
      const nodeOfLog = flowData?.nodes.find((node) => node.id === log.nodeId);

      return {
        ...log,
        node: nodeOfLog,
        title: `${nodeTitle(nodeOfLog)} -> ${log.type}`,
      };
    });
  }, [flowData, recordedLogs, sseLogs, nodeTitle]);

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

  const durationItems = useMemo(
    () => DURATION_OPTIONS.map(({ minutes, labelKey }) => ({ key: String(minutes), label: t(labelKey) })),
    [t],
  );
  return {
    isOpen,
    setOpen,
    open,
    t,
    durationMinutes,
    setDurationMinutes,
    isRecording,
    startRecording,
    isStarting,
    stopRecording,
    isStopping,
    countdown,
    logsOrdered,
    logsByRunId,
    runHeader,
    durationItems,
    props,
  } as const;
}
