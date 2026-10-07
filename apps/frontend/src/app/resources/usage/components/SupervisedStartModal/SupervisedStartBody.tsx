import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  AlertContent,
  AlertDescription,
  Description,
  Label,
  Spinner,
} from '@heroui/react';
import { AttraccessUser } from '@attraccess/plugins-frontend-ui';
import { Attractap } from '@attraccess/react-query-client';
import { Button } from '../../../../../components/button';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { Phase } from './index.phase';
import { ResourceIntroducer } from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { ReactNode } from 'react';
type Props = {
  phase: Phase;
  waitingAtReader: string | null;
  secondsLeft: number;
  t: TFunction;
  isLoadingCandidates: boolean;
  supervisors: ResourceIntroducer[];
  resourceReaders: Attractap[];
  otherReaders: Attractap[];
  renderReaderButton: (reader: Attractap) => ReactNode;
  handleSelectSupervisor: (userId: number) => void;
};
export function SupervisedStartBody({
  phase,
  waitingAtReader,
  secondsLeft,
  t,
  isLoadingCandidates,
  supervisors,
  resourceReaders,
  otherReaders,
  renderReaderButton,
  handleSelectSupervisor,
}: Props) {
  if (phase === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <Spinner color="accent" />
        <Description>
          {waitingAtReader ? t('waiting.atReader', { reader: waitingAtReader }) : t('waiting.description')}
        </Description>
        <p className="text-3xl font-semibold tabular-nums">{t('waiting.countdown', { seconds: secondsLeft })}</p>
      </div>
    );
  }

  if (phase === 'timeout' || phase === 'rejected' || phase === 'error') {
    return (
      <div className="space-y-4">
        <Alert status="warning">
          <AlertStatusIcon status="warning" />
          <AlertContent>
            <AlertDescription>{t(`${phase}.description`)}</AlertDescription>
          </AlertContent>
        </Alert>
      </div>
    );
  }

  if (isLoadingCandidates) {
    return (
      <div className="flex justify-center py-4">
        <Spinner color="accent" />
      </div>
    );
  }

  if (supervisors.length === 0) {
    return <Description>{t('select.empty')}</Description>;
  }

  return (
    <div className="space-y-5">
      <Description>{t('select.description')}</Description>

      <div className="space-y-2">
        <Label>{t('select.people')}</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {supervisors.map((supervisor) => (
            <Button
              key={supervisor.id}
              variant="outline"
              className="h-auto w-full justify-start py-2"
              onPress={() => handleSelectSupervisor(supervisor.userId)}
            >
              <AttraccessUser user={supervisor.user} description={t('select.role.introducer')} />
            </Button>
          ))}
        </div>
      </div>

      {resourceReaders.length + otherReaders.length > 0 && (
        <div className="space-y-2">
          <Label>{t('select.readers')}</Label>
          <Description>{t('select.readerHint')}</Description>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{resourceReaders.map(renderReaderButton)}</div>
          {otherReaders.length > 0 && (
            <Accordion>
              <AccordionItem id="other-readers" aria-label={t('select.otherReaders')}>
                <AccordionHeading>
                  <AccordionTrigger>{t('select.otherReaders')}</AccordionTrigger>
                </AccordionHeading>
                <AccordionPanel>
                  <AccordionBody>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{otherReaders.map(renderReaderButton)}</div>
                  </AccordionBody>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      )}
    </div>
  );
}
