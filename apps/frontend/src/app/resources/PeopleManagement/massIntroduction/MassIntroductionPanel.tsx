// Mass-introduction tab of the grant-introduction drawer: a temporary QR code (optionally an Attractap
// scan screen) and a live list of who joined
// FEATURE: ATT-1151 Mass introduction
import { useMemo } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Chip,
  Description,
  Label,
  ProgressBar,
  ProgressBarOutput,
  ProgressBarFill,
  ProgressBarTrack,
} from '@heroui/react';
import { QRCode } from 'react-qrcode-logo';
import { AttraccessUser, TFunction } from '@attraccess/plugins-frontend-ui';
import {
  MassIntroductionParticipantDto,
  MassIntroductionReaderDto,
  MassIntroductionReaderState,
  MassIntroductionSessionDto,
} from '@attraccess/react-query-client';
import { Button } from '../../../../components/button';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { AttractapSelect } from '../../../attractap/AttractapSelect';
import { MassIntroductionEndState, MassIntroductionSessionState } from './useMassIntroductionSession';

const REQUIRED_READER_CAPABILITIES = { massIntroduction: true };

/** Choices made before starting; owned by the drawer so the footer's Start button can read them. */
export interface MassIntroductionSetup {
  useReader: boolean;
  readerId: number | null;
}

export const INITIAL_MASS_INTRODUCTION_SETUP: MassIntroductionSetup = { useReader: false, readerId: null };

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

interface MassIntroductionContentProps {
  t: TFunction;
  state: MassIntroductionSessionState;
  setup: MassIntroductionSetup;
  onSetupChange: (setup: MassIntroductionSetup) => void;
}

export function MassIntroductionContent({ t, state, setup, onSetupChange }: Readonly<MassIntroductionContentProps>) {
  const { phase, session, endReason } = state;

  if (phase === 'setup') {
    return <SetupStep t={t} error={state.startError} setup={setup} onSetupChange={onSetupChange} />;
  }

  if (phase === 'active' && session) {
    return (
      <div className="flex flex-col gap-4">
        <Description>{t('subtitle.active', { name: session.target.name })}</Description>
        <ActiveSession t={t} session={session} secondsLeft={state.secondsLeft} />
        <Participants t={t} participants={session.participants} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <EndedNotice t={t} reason={endReason ?? 'unknown'} />
      {session && <Participants t={t} participants={session.participants} />}
    </div>
  );
}

interface MassIntroductionActionsProps {
  t: TFunction;
  state: MassIntroductionSessionState;
  setup: MassIntroductionSetup;
  /** Closes the drawer; a running session is ended by unmounting. */
  onClose: () => void;
}

export function MassIntroductionActions({ t, state, setup, onClose }: Readonly<MassIntroductionActionsProps>) {
  if (state.phase === 'setup') {
    return (
      <>
        <Button variant="ghost" onPress={onClose} data-cy="mass-introduction-cancel">
          {t('setup.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={() => state.start(setup.useReader && setup.readerId !== null ? setup.readerId : undefined)}
          isPending={state.isStarting}
          isDisabled={setup.useReader && setup.readerId === null}
          data-cy="mass-introduction-start"
        >
          {t('setup.start')}
        </Button>
      </>
    );
  }

  if (state.phase === 'active') {
    return (
      <Button variant="danger" onPress={state.cancel} data-cy="mass-introduction-end">
        {t('active.end')}
      </Button>
    );
  }

  return (
    <>
      <Button variant="ghost" onPress={state.reset} data-cy="mass-introduction-restart">
        {t('ended.restart')}
      </Button>
      <Button variant="primary" onPress={onClose} data-cy="mass-introduction-close">
        {t('ended.close')}
      </Button>
    </>
  );
}

interface SetupStepProps {
  t: TFunction;
  error: string | null;
  setup: MassIntroductionSetup;
  onSetupChange: (setup: MassIntroductionSetup) => void;
}

function SetupStep({ t, error, setup, onSetupChange }: Readonly<SetupStepProps>) {
  return (
    <div className="flex flex-col gap-4">
      <Description>{t('setup.description')}</Description>
      <LabeledSwitch
        isSelected={setup.useReader}
        onChange={(useReader) => onSetupChange({ ...setup, useReader })}
        data-cy="mass-introduction-use-reader"
      >
        <Label>{t('setup.useReader')}</Label>
      </LabeledSwitch>
      {setup.useReader && (
        <div className="flex flex-col gap-1">
          <AttractapSelect
            label={t('setup.readerLabel')}
            placeholder={t('setup.readerPlaceholder')}
            selection={setup.readerId}
            onSelectionChange={(readerId) => onSetupChange({ ...setup, readerId })}
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
    </div>
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
