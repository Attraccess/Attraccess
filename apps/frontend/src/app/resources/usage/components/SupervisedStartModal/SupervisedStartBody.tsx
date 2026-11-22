import { userIdentityFromDisplayName } from '../../../../../utils/userIdentityFromDisplayName';
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
import { Nfc } from 'lucide-react';
import { AlertStatusIcon, AttraccessUser, Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import type { Attractap, ResourceIntroducerNameDto } from '@attraccess/react-query-client';
import en from './translations/en.json';
import de from './translations/de.json';

export type Phase = 'select' | 'waiting' | 'timeout' | 'rejected' | 'error';

interface SupervisedStartBodyProps {
  phase: Phase;
  waitingAtReader: string | null;
  secondsLeft: number;
  isLoadingCandidates: boolean;
  supervisors: ResourceIntroducerNameDto[];
  resourceReaders: Attractap[];
  otherReaders: Attractap[];
  onSelectSupervisor: (userId: number) => void;
  onSelectReader: (reader: Attractap) => void;
}

function ReaderButton({ reader, onSelect }: Readonly<{ reader: Attractap; onSelect: (reader: Attractap) => void }>) {
  return (
    <Button variant="outline" className="h-auto w-full justify-start py-2" onPress={() => onSelect(reader)}>
      <Nfc size={16} className="shrink-0" />
      <span className="truncate">{reader.name}</span>
    </Button>
  );
}

/** Drawer body for each phase: pick a supervisor or reader, wait for approval, or explain why it ended. */
export function SupervisedStartBody(props: Readonly<SupervisedStartBodyProps>) {
  const {
    phase,
    waitingAtReader,
    secondsLeft,
    isLoadingCandidates,
    supervisors,
    resourceReaders,
    otherReaders,
    onSelectSupervisor,
    onSelectReader,
  } = props;
  const { t } = useTranslations({ en, de });
  const renderReaderButton = (reader: Attractap) => (
    <ReaderButton key={reader.id} reader={reader} onSelect={onSelectReader} />
  );

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
              key={supervisor.userId}
              variant="outline"
              className="h-auto w-full justify-start py-2"
              onPress={() => onSelectSupervisor(supervisor.userId)}
            >
              <AttraccessUser
                user={userIdentityFromDisplayName({ id: supervisor.userId, ...supervisor })}
                description={t('select.role.introducer')}
                // The whole row is the button that picks the supervisor; a popover inside it would swallow the click.
                interactive={false}
              />
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
