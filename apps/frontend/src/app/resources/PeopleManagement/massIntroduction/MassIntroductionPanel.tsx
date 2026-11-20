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
import { AttraccessUser, LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  MassIntroductionParticipantDto,
  MassIntroductionReaderDto,
  MassIntroductionReaderState,
  MassIntroductionSessionDto,
  useGetResourceAttractaps,
  useGetResourceGroupAttractaps,
} from '@attraccess/react-query-client';
import { AttractapSelect } from '../../../attractap/AttractapSelect';
import { massIntroductionUrl } from '../../../mass-introduction/MassIntroductionRedeemModal';
import { PeopleTarget } from '../types';
import { MassIntroductionEndState, MassIntroductionSessionState, secondsUntil } from './useMassIntroductionSession';
import en from './en.json';
import de from './de.json';

// The scan screen needs a display, and firmware 2.0.0 or later (card relay) or the server refuses the reader.
const REQUIRED_READER_CAPABILITIES = { cardEnrollment: true, cardRelay: true };

/** Choices made before starting; owned by the drawer so the footer's Start button can read them. */
export interface MassIntroductionSetup {
  useReader: boolean;
  readerId: number | null;
}

export const INITIAL_MASS_INTRODUCTION_SETUP: MassIntroductionSetup = { useReader: false, readerId: null };

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

interface MassIntroductionContentProps {
  target: PeopleTarget;
  state: MassIntroductionSessionState;
  setup: MassIntroductionSetup;
  onSetupChange: (setup: MassIntroductionSetup) => void;
}

export function MassIntroductionContent(props: Readonly<MassIntroductionContentProps>) {
  const { target, state, setup, onSetupChange } = props;
  const { t } = useTranslations({ en, de });
  const { phase, session, endReason } = state;

  if (phase === 'setup') {
    return <SetupStep target={target} setup={setup} onSetupChange={onSetupChange} />;
  }

  if (phase === 'active' && session) {
    return (
      <div className="flex flex-col gap-4">
        <Description>{t('subtitle.active', { name: session.target.name })}</Description>
        <ActiveSession session={session} secondsLeft={state.secondsLeft} />
        <Participants participants={session.participants} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <EndedNotice reason={endReason ?? 'unknown'} />
      {session && <Participants participants={session.participants} />}
    </div>
  );
}

interface SetupStepProps {
  target: PeopleTarget;
  setup: MassIntroductionSetup;
  onSetupChange: (setup: MassIntroductionSetup) => void;
}

function SetupStep({ target, setup, onSetupChange }: Readonly<SetupStepProps>) {
  const { t } = useTranslations({ en, de });
  // Only readers linked to the resource (or a resource of the group) may show the scan screen.
  const isResource = target.type === 'resource';
  const resourceReaders = useGetResourceAttractaps({ path: { resourceId: target.id } }, undefined, {
    enabled: setup.useReader && isResource,
  });
  const groupReaders = useGetResourceGroupAttractaps({ path: { groupId: target.id } }, undefined, {
    enabled: setup.useReader && !isResource,
  });
  const linkedReaderIds = (isResource ? resourceReaders : groupReaders).data?.map((reader) => reader.id);

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
            readerIds={linkedReaderIds ?? []}
          />
          <Description>{t('setup.readerDescription')}</Description>
        </div>
      )}
    </div>
  );
}

interface ActiveSessionProps {
  session: MassIntroductionSessionDto;
  secondsLeft: number;
}

function ActiveSession({ session, secondsLeft }: Readonly<ActiveSessionProps>) {
  const { t } = useTranslations({ en, de });
  const url = useMemo(() => massIntroductionUrl(session), [session]);
  const totalSeconds = Math.max(
    1,
    Math.round((new Date(session.expiresAt).getTime() - new Date(session.createdAt).getTime()) / 1000),
  );

  return (
    <>
      <figure className="flex flex-col items-center gap-2" aria-label={t('active.qrLabel')}>
        <QRCode value={url} size={256} qrStyle="fluid" quietZone={8} />
        <Description className="text-center">{t('active.scanHint')}</Description>
        <JoinCode code={session.code} refreshAt={session.codeRefreshAt} />
        <Description className="text-center">{t('active.rotationHint')}</Description>
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

      {session.reader && <ReaderStatus reader={session.reader} />}
    </>
  );
}

/** Rerenders every second with the session countdown, so the "changes in" hint stays current. */
function JoinCode({ code, refreshAt }: Readonly<{ code: string; refreshAt: string }>) {
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex flex-col items-center" data-cy="mass-introduction-code">
      <Label>{t('active.codeLabel')}</Label>
      <output
        className="text-4xl font-semibold tabular-nums tracking-widest text-foreground"
        aria-label={t('active.codeLabel')}
      >
        {`${code.slice(0, 3)} ${code.slice(3)}`}
      </output>
      <Description className="tabular-nums">
        {t('active.codeChangesIn', { seconds: secondsUntil(refreshAt) })}
      </Description>
    </div>
  );
}

function ReaderStatus({ reader }: Readonly<{ reader: MassIntroductionReaderDto }>) {
  const { t } = useTranslations({ en, de });
  const isActive = reader.state === MassIntroductionReaderState.ACTIVE;
  return (
    <Alert status={isActive ? 'success' : 'warning'} data-cy="mass-introduction-reader-status">
      <AlertContent>
        <AlertDescription>{t(isActive ? 'reader.active' : 'reader.detached', { name: reader.name })}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}

function EndedNotice({ reason }: Readonly<{ reason: MassIntroductionEndState }>) {
  const { t } = useTranslations({ en, de });
  return (
    <Alert status={reason === 'revoked' ? 'danger' : 'default'} data-cy="mass-introduction-ended">
      <AlertContent>
        <AlertTitle>{t('ended.title')}</AlertTitle>
        <AlertDescription>{t(`ended.reason.${reason}`)}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}

function Participants({ participants }: Readonly<{ participants: MassIntroductionParticipantDto[] }>) {
  const { t } = useTranslations({ en, de });
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
