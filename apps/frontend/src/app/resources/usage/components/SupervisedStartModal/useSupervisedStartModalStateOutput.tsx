import { Alert, AlertContent, AlertDescription, Description, Spinner } from '@heroui/react';
import { Nfc } from 'lucide-react';
import { Attractap } from '@attraccess/react-query-client';
import { Button } from '../../../../../components/button';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Label,
} from '@heroui/react';
import { AttraccessUser } from '@attraccess/plugins-frontend-ui';
import type { useSupervisedStartModalStateInputs } from './useSupervisedStartModalStateInputs';

export function useSupervisedStartModalStateOutput(model: ReturnType<typeof useSupervisedStartModalStateInputs>) {
  const renderReaderButton = (reader: Attractap) => (
    <Button
      key={reader.id}
      variant="outline"
      className="h-auto w-full justify-start py-2"
      onPress={() => model.handleSelectReader(reader)}
    >
      <Nfc size={16} className="shrink-0" />
      <span className="truncate">{reader.name}</span>
    </Button>
  );

  const renderBody = () => {
    if (model.phase === 'waiting') {
      return (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <Spinner color="accent" />
          <Description>
            {model.waitingAtReader
              ? model.t('waiting.atReader', { reader: model.waitingAtReader })
              : model.t('waiting.description')}
          </Description>
          <p className="text-3xl font-semibold tabular-nums">
            {model.t('waiting.countdown', { seconds: model.secondsLeft })}
          </p>
        </div>
      );
    }

    if (model.phase === 'timeout' || model.phase === 'rejected' || model.phase === 'error') {
      return (
        <div className="space-y-4">
          <Alert status="warning">
            <AlertStatusIcon status="warning" />
            <AlertContent>
              <AlertDescription>{model.t(`${model.phase}.description`)}</AlertDescription>
            </AlertContent>
          </Alert>
        </div>
      );
    }

    if (model.isLoadingCandidates) {
      return (
        <div className="flex justify-center py-4">
          <Spinner color="accent" />
        </div>
      );
    }

    if (model.supervisors.length === 0) {
      return <Description>{model.t('select.empty')}</Description>;
    }

    return (
      <div className="space-y-5">
        <Description>{model.t('select.description')}</Description>

        <div className="space-y-2">
          <Label>{model.t('select.people')}</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {model.supervisors.map((supervisor) => (
              <Button
                key={supervisor.id}
                variant="outline"
                className="h-auto w-full justify-start py-2"
                onPress={() => model.handleSelectSupervisor(supervisor.userId)}
              >
                <AttraccessUser user={supervisor.user} description={model.t('select.role.introducer')} />
              </Button>
            ))}
          </div>
        </div>

        {model.resourceReaders.length + model.otherReaders.length > 0 && (
          <div className="space-y-2">
            <Label>{model.t('select.readers')}</Label>
            <Description>{model.t('select.readerHint')}</Description>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{model.resourceReaders.map(renderReaderButton)}</div>
            {model.otherReaders.length > 0 && (
              <Accordion>
                <AccordionItem id="other-readers" aria-label={model.t('select.otherReaders')}>
                  <AccordionHeading>
                    <AccordionTrigger>{model.t('select.otherReaders')}</AccordionTrigger>
                  </AccordionHeading>
                  <AccordionPanel>
                    <AccordionBody>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {model.otherReaders.map(renderReaderButton)}
                      </div>
                    </AccordionBody>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        )}
      </div>
    );
  };
  return {
    t: model.t,
    phase: model.phase,
    setPhase: model.setPhase,
    renderBody,
    isOpen: model.isOpen,
    onClose: model.onClose,
  } as const;
}
