// Introducer dialog: start a temporary QR code (optionally an Attractap scan screen) and watch people join
// FEATURE: ATT-1151 Mass introduction
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Chip,
  Description,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  ModalIcon,
  ProgressBar,
  ProgressBarOutput,
  ProgressBarFill,
  ProgressBarTrack,
} from '@heroui/react';
import { QRCode } from 'react-qrcode-logo';
import { UsersIcon } from 'lucide-react';
import { AttraccessUser, TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  MassIntroductionParticipantDto,
  MassIntroductionReaderDto,
  MassIntroductionReaderState,
  MassIntroductionSessionDto,
} from '@attraccess/react-query-client';
import { Button } from '../../../../components/button';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { StandardModal } from '../../../../components/standardModal';
import { AttractapSelect } from '../../../attractap/AttractapSelect';
import { PeopleTarget } from '../types';
import { MassIntroductionEndState, useMassIntroductionSession } from './useMassIntroductionSession';
import en from './en.json';
import de from './de.json';

const REQUIRED_READER_CAPABILITIES = { massIntroduction: true };

export function massIntroductionUrl(token: string): string {
  const url = new URL(window.location.origin);
  url.pathname = '/mass-introduction';
  url.searchParams.set('token', token);
  return url.toString();
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

interface MassIntroductionModalProps {
  target: PeopleTarget;
  /** The dialog cancels a running session itself before calling this. */
  onClose: () => void;
}

/** Mount only while open: unmounting ends a running session. */
export function MassIntroductionModal({ target, onClose }: Readonly<MassIntroductionModalProps>) {
  const { t } = useTranslations({ en, de });
  const massIntroduction = useMassIntroductionSession(target);
  const { phase, session, endReason, cancel } = massIntroduction;

  const close = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);

  return (
    <StandardModal
      isOpen
      onOpenChange={(isOpen) => !isOpen && close()}
      size="md"
      // A stray click next to the dialog must not end the session.
      backdropProps={{ isDismissable: false }}
      data-cy="mass-introduction-modal"
    >
      {() => (
        <>
          <ModalHeader>
            <ModalIcon>
              <UsersIcon />
            </ModalIcon>
            <ModalHeading>{t('title')}</ModalHeading>
            <Description>
              {session ? t('subtitle.active', { name: session.target.name }) : t('subtitle.setup')}
            </Description>
          </ModalHeader>

          {phase === 'setup' && (
            <SetupStep
              t={t}
              error={massIntroduction.startError}
              isStarting={massIntroduction.isStarting}
              onStart={massIntroduction.start}
              onCancel={close}
            />
          )}

          {phase === 'active' && session && (
            <>
              <ModalBody className="flex flex-col gap-4">
                <ActiveSession t={t} session={session} secondsLeft={massIntroduction.secondsLeft} />
                <Participants t={t} participants={session.participants} />
              </ModalBody>
              <ModalFooter>
                <Button variant="danger" onPress={close} data-cy="mass-introduction-end">
                  {t('active.end')}
                </Button>
              </ModalFooter>
            </>
          )}

          {phase === 'ended' && (
            <>
              <ModalBody className="flex flex-col gap-4">
                <EndedNotice t={t} reason={endReason ?? 'unknown'} />
                {session && <Participants t={t} participants={session.participants} />}
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onPress={massIntroduction.reset} data-cy="mass-introduction-restart">
                  {t('ended.restart')}
                </Button>
                <Button variant="primary" onPress={close} data-cy="mass-introduction-close">
                  {t('ended.close')}
                </Button>
              </ModalFooter>
            </>
          )}
        </>
      )}
    </StandardModal>
  );
}

interface SetupStepProps {
  t: TFunction;
  error: string | null;
  isStarting: boolean;
  onStart: (readerId?: number) => void;
  onCancel: () => void;
}

function SetupStep({ t, error, isStarting, onStart, onCancel }: Readonly<SetupStepProps>) {
  const [useReader, setUseReader] = useState(false);
  const [readerId, setReaderId] = useState<number | null>(null);
  const isMissingReader = useReader && readerId === null;

  return (
    <>
      <ModalBody className="flex flex-col gap-4">
        <Description>{t('setup.description')}</Description>
        <LabeledSwitch isSelected={useReader} onChange={setUseReader} data-cy="mass-introduction-use-reader">
          <Label>{t('setup.useReader')}</Label>
        </LabeledSwitch>
        {useReader && (
          <div className="flex flex-col gap-1">
            <AttractapSelect
              label={t('setup.readerLabel')}
              placeholder={t('setup.readerPlaceholder')}
              selection={readerId}
              onSelectionChange={setReaderId}
              requiredCapabilities={REQUIRED_READER_CAPABILITIES}
            />
            <Description>{t('setup.readerDescription')}</Description>
          </div>
        )}
        {error && (
          <Alert status="danger" data-cy="mass-introduction-start-error">
            <AlertContent>
              <AlertTitle>{t('setup.startFailed')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onPress={onCancel} data-cy="mass-introduction-cancel">
          {t('setup.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={() => onStart(useReader && readerId !== null ? readerId : undefined)}
          isPending={isStarting}
          isDisabled={isMissingReader}
          data-cy="mass-introduction-start"
        >
          {t('setup.start')}
        </Button>
      </ModalFooter>
    </>
  );
}

interface ActiveSessionProps {
  t: TFunction;
  session: MassIntroductionSessionDto;
  secondsLeft: number;
}

function ActiveSession({ t, session, secondsLeft }: Readonly<ActiveSessionProps>) {
  const url = useMemo(() => massIntroductionUrl(session.token), [session.token]);
  const totalSeconds = Math.max(
    1,
    Math.round((new Date(session.expiresAt).getTime() - new Date(session.createdAt).getTime()) / 1000),
  );

  return (
    <>
      <figure className="flex flex-col items-center gap-2" aria-label={t('active.qrLabel')}>
        <QRCode value={url} size={256} qrStyle="fluid" quietZone={8} />
        <Description className="text-center">{t('active.scanHint')}</Description>
      </figure>

      <ProgressBar
        value={secondsLeft}
        minValue={0}
        maxValue={totalSeconds}
        valueLabel={formatCountdown(secondsLeft)}
        color={secondsLeft <= 60 ? 'warning' : 'accent'}
        data-cy="mass-introduction-countdown"
      >
        <Label>{t('active.timeRemaining')}</Label>
        <ProgressBarOutput className="tabular-nums" />
        <ProgressBarTrack>
          <ProgressBarFill />
        </ProgressBarTrack>
      </ProgressBar>

      {session.reader && <ReaderStatus t={t} reader={session.reader} />}
    </>
  );
}

function ReaderStatus({ t, reader }: Readonly<{ t: TFunction; reader: MassIntroductionReaderDto }>) {
  const isActive = reader.state === MassIntroductionReaderState.ACTIVE;
  return (
    <Alert status={isActive ? 'success' : 'warning'} data-cy="mass-introduction-reader-status">
      <AlertContent>
        <AlertDescription>{t(isActive ? 'reader.active' : 'reader.detached', { name: reader.name })}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}

function EndedNotice({ t, reason }: Readonly<{ t: TFunction; reason: MassIntroductionEndState }>) {
  return (
    <Alert status={reason === 'revoked' ? 'danger' : 'default'} data-cy="mass-introduction-ended">
      <AlertContent>
        <AlertTitle>{t('ended.title')}</AlertTitle>
        <AlertDescription>{t(`ended.reason.${reason}`)}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}

function Participants({ t, participants }: Readonly<{ t: TFunction; participants: MassIntroductionParticipantDto[] }>) {
  // Newest first, so the introducer sees who just joined without scrolling.
  const sorted = useMemo(
    () => [...participants].sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()),
    [participants],
  );

  return (
    <section className="flex flex-col gap-2" data-cy="mass-introduction-participants">
      <Label>{t('participants.title', { count: participants.length })}</Label>
      {sorted.length === 0 ? (
        <Description>{t('participants.empty')}</Description>
      ) : (
        <ul className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {sorted.map((participant) => (
            <li key={participant.userId} className="flex items-center justify-between gap-2">
              <AttraccessUser user={{ id: participant.userId, username: participant.username }} interactive={false} />
              <div className="flex flex-wrap justify-end gap-1">
                {participant.alreadyIntroduced && (
                  <Chip size="sm" color="default">
                    {t('participants.alreadyIntroduced')}
                  </Chip>
                )}
                <Chip size="sm" color={participant.method === 'nfc' ? 'accent' : 'success'}>
                  {t(`participants.method.${participant.method}`)}
                </Chip>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
