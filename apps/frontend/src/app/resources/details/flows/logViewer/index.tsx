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
  ToggleButton,
} from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { EmptyState } from '../../../../../components/emptyState';
import { Select } from '../../../../../components/select';
import { CircleStopIcon, CircleDotIcon, PartyPopperIcon } from 'lucide-react';
import { Props } from './index.props';
import { prettyPayload } from './index.helpers';
import { triggerNodeOfRun } from './index.helpers';
import { useLogViewerState } from './useLogViewerState';

// Payloads over the recorder's limit arrive truncated, so they are no longer valid JSON.
// Logs are newest-first and a run's oldest entry is the synthetic flow.start, which has
// no node — so the node that triggered the run is the oldest entry that does have one.

export function LogViewer(props: Props) {
  const {
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
  } = useLogViewerState(props);

  return (
    <>
      {props.children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen} dialogProps={{ 'aria-label': t('title') }}>
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

            <ToggleButton
              className="self-start"
              isSelected={props.confettiEnabled}
              onChange={props.onConfettiEnabledChange}
            >
              <PartyPopperIcon />
              {t('confetti')}
            </ToggleButton>

            {!isRecording && logsOrdered.length === 0 && <EmptyState message={t('recording.hint')} />}
            {isRecording && logsOrdered.length === 0 && <EmptyState message={t('recording.waiting')} />}

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

export { prettyPayload } from './index.helpers';
export { triggerNodeOfRun };
