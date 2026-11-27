import { DrawerBody, DrawerHeader, useOverlayState } from '@heroui/react';
import { PageHeader, StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useEffect, useState } from 'react';
import de from './de.json';
import en from './en.json';
import { useFlowContext } from '../context/index';
import { newestUniqueLogs } from './newestUniqueLogs';
import { LogViewerContent } from './LogViewerContent';
import { useFlowLogRecording } from '../flowOwner';

export interface Props {
  children: (open: () => void) => React.ReactNode;
  confettiEnabled: boolean;
  onConfettiEnabledChange: (enabled: boolean) => void;
}

export function LogViewer(props: Props) {
  const { isOpen, setOpen, open } = useOverlayState();
  const { t } = useTranslations({ de, en });
  const { owner } = useFlowContext();

  // The editor keeps the recording alive (FlowLogsProvider); the status is polled while the drawer is open to
  // notice when it expires. Status only — polling the logs endpoint would re-ship the whole buffer every tick.
  const { recording, isRecording, logs: fetchedLogs } = useFlowLogRecording(owner, { isOpen });

  const [recordedLogs, setRecordedLogs] = useState<ResourceFlowLog[]>([]);
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

  return (
    <>
      {props.children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen} dialogProps={{ 'aria-label': t('title') }}>
        <DrawerHeader>
          <PageHeader title={t('title')} subtitle={t('subtitle')} noMargin />
        </DrawerHeader>

        <DrawerBody>
          {/* Rendered only while the drawer is open: it reads the live entries, which change many times a second. */}
          <LogViewerContent
            recordedLogs={recordedLogs}
            isRecording={isRecording}
            confettiEnabled={props.confettiEnabled}
            onConfettiEnabledChange={props.onConfettiEnabledChange}
          />
        </DrawerBody>
      </StandardDrawer>
    </>
  );
}
