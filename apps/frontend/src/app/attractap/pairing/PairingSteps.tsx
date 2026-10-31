import { Button, ColorSwatch, Input, Label, Spinner, TextField } from '@heroui/react';
import { ArrowLeftIcon, CameraIcon } from 'lucide-react';
import { useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { PairingDto } from '@attraccess/react-query-client';
import { useMemo } from 'react';
import { Select } from '../../../components/select';
import { ResourceScanner } from '../../resourceOverview/toolbar/scanner';
import { enrollmentCodeFromScan, formatEnrollmentCode } from './enrollmentCode';
import { PairingError } from './pairingUtils';
import { Choice, PairingFlow } from './usePairingFlow';
import en from './en.json';

type LedColour = 'red' | 'green' | 'blue' | 'yellow' | 'white' | 'magenta';
const NAME_MAX_LENGTH = 64;
// Close to what the WS2812 ring shows (yellow is the firmware's 255/200/0), so swatch and ring look alike.
const SWATCH: Record<LedColour, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffc800',
  white: '#ffffff',
  magenta: '#ff00ff',
};
const MODES: Choice[] = ['new', 'takeover'];

type T = PairingFlow['t'];

const ERROR_TEXT: Record<string, (t: T, error: PairingError) => string> = {
  rateLimited: (t, error) =>
    error.retryAfterSeconds === undefined
      ? t('dialog.error.rateLimited')
      : t('dialog.error.rateLimitedRetry', { seconds: error.retryAfterSeconds }),
  unknown: (t, error) => (error.message ? `${t('dialog.error.unknown')}: ${error.message}` : t('dialog.error.unknown')),
};

export function errorText(t: T, error: PairingError) {
  return (ERROR_TEXT[error.kind] ?? ((tt: T) => tt(`dialog.error.${error.kind}`)))(t, error);
}

/**
 * One row in ring order: segment 8 sits next to segment 1, so any other layout could be misread. On a
 * narrow screen the row scrolls sideways instead of wrapping.
 */
function PatternSwatches(
  props: Readonly<{ pattern: LedColour[]; colourName: (colour: string) => string; startLabel: string }>,
) {
  return (
    <div className="w-full overflow-x-auto">
      <ol className="mx-auto flex w-max gap-2" data-cy="attractap-pairing-pattern">
        {props.pattern.map((colour, index) => (
          <li key={`${index}-${colour}`} className="flex flex-col items-center gap-1 text-xs">
            <span aria-hidden="true">
              <ColorSwatch color={SWATCH[colour]} size="sm" />
            </span>
            <span className="font-semibold">{index === 0 ? props.startLabel : index + 1}</span>
            <span>{props.colourName(colour)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PatternStep({ flow, current }: Readonly<{ flow: PairingFlow; current: PairingDto }>) {
  const { t } = flow;
  const colourName = (colour: string) => (colour in en.dialog.colour ? t(`dialog.colour.${colour}`) : colour);
  return (
    <div className="flex flex-col items-center gap-3" data-cy="attractap-pairing-lite">
      <p>{t('dialog.comparePattern')}</p>
      {current.pattern ? (
        <PatternSwatches
          pattern={current.pattern as LedColour[]}
          colourName={colourName}
          startLabel={t('dialog.segmentStart')}
        />
      ) : (
        <Spinner size="sm" />
      )}
      <p className="text-sm text-default-500">{t('dialog.patternHint')}</p>
    </div>
  );
}

export function CodeField({ flow, insecure }: Readonly<{ flow: PairingFlow; insecure: boolean }>) {
  const { t } = flow;
  const scan = (raw: string) => {
    const scanned = enrollmentCodeFromScan(raw);
    if (scanned) flow.setCodeFromScan(formatEnrollmentCode(scanned));
    return scanned !== null;
  };
  return (
    <div className="flex items-end gap-2">
      <TextField className="grow" value={flow.codeInput} onChange={flow.setCodeInput} isDisabled={!flow.idle}>
        <Label>{t('dialog.codeLabel')}</Label>
        <Input
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          placeholder="K7P-3XQ"
          className="font-mono tracking-widest"
          data-cy="attractap-pairing-code-input"
        />
      </TextField>
      {!insecure && (
        <ResourceScanner title={t('dialog.scanTitle')} onDetected={scan} cameraFallbackHint={t('dialog.scanFallback')}>
          {(open) => (
            <Button variant="secondary" onPress={open} data-cy="attractap-pairing-scan">
              <CameraIcon className="size-4" />
              {t('dialog.scan')}
            </Button>
          )}
        </ResourceScanner>
      )}
    </div>
  );
}

/** Asks for the code when the request is not known yet; Lite readers can be picked from the waiting list. */
export function FindStep(props: Readonly<{ flow: PairingFlow; insecure: boolean; presetTargetReaderId?: number }>) {
  const { flow, presetTargetReaderId } = props;
  const { t } = flow;
  const format = useDateTimeFormatter();
  const targetName = flow.readers?.find((reader) => reader.id === presetTargetReaderId)?.name;
  const waitingLite = presetTargetReaderId
    ? flow.running.filter((p) => p.kind === 'lite' && p.boundReaderId === null && !p.mode)
    : [];
  return (
    <div className="flex flex-col gap-3">
      {targetName && <p>{t('dialog.takesOver', { name: targetName })}</p>}
      <p className="text-sm text-default-500">{t('dialog.findHint')}</p>
      <CodeField flow={flow} insecure={props.insecure} />
      {waitingLite.length > 0 && (
        <div className="flex flex-col gap-2" data-cy="attractap-pairing-lite-list">
          <p className="text-sm text-default-500">{t('dialog.liteHint')}</p>
          {waitingLite.map((p) => (
            <Button
              key={p.id}
              variant="secondary"
              onPress={() => flow.setPickedId(p.id)}
              data-cy={`attractap-pairing-pick-${p.id}`}
            >
              {t('dialog.pickLite', { time: format(p.createdAt) })}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** New reader (optional name) or a takeover of an existing record. */
export function ModeStep({ flow }: Readonly<{ flow: PairingFlow }>) {
  const { t } = flow;
  const ownReaderId = flow.current?.boundReaderId ?? null;
  const readerOptions = useMemo(
    // Any record can be taken over, also a token reader that was never paired (new hardware replaces it).
    () =>
      (flow.readers ?? [])
        .filter((reader) => reader.id !== ownReaderId)
        .map((reader) => ({ key: reader.id.toString(), label: reader.name })),
    [flow.readers, ownReaderId],
  );
  return (
    <div className="flex flex-col gap-3">
      <p>{t('dialog.chooseMode')}</p>
      <Select
        items={MODES.map((m) => ({ key: m, label: t(`dialog.mode.${m}`) }))}
        aria-label={t('dialog.chooseMode')}
        value={flow.choice}
        onChange={(key) => flow.setChoice(key as Choice)}
      />
      {flow.choice === 'new' ? (
        <TextField value={flow.name} onChange={flow.setName} isDisabled={!flow.idle}>
          <Label>{t('dialog.nameLabel')}</Label>
          <Input autoComplete="off" maxLength={NAME_MAX_LENGTH} data-cy="attractap-pairing-name" />
        </TextField>
      ) : (
        <Select
          items={readerOptions}
          label={t('dialog.targetReader')}
          value={flow.pickedTarget?.toString() ?? ''}
          onChange={(key) => flow.setPickedTarget(Number(key))}
        />
      )}
    </div>
  );
}

/** How the admin proves the reader: a colour pattern, the code they already entered, or a code typed here. */
export function ProofStep(props: Readonly<{ flow: PairingFlow; current: PairingDto; insecure: boolean }>) {
  const { flow, current } = props;
  const { t } = flow;
  if (flow.byPattern) return <PatternStep flow={flow} current={current} />;
  if (flow.resolvedByCode && !flow.codeRejected) {
    const code = flow.normalizedCode ? formatEnrollmentCode(flow.normalizedCode) : '';
    return <p data-cy="attractap-pairing-code-chosen">{t('dialog.codeFound', { code })}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-default-500">{t('dialog.typeCode')}</p>
      <CodeField flow={flow} insecure={props.insecure} />
    </div>
  );
}

export function ReaderStep(props: Readonly<{ flow: PairingFlow; current: PairingDto; insecure: boolean }>) {
  const { flow, current } = props;
  return (
    <div className="flex flex-col gap-4">
      {flow.pickedFromList && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onPress={flow.backToList}
          data-cy="attractap-pairing-back-to-list"
        >
          <ArrowLeftIcon className="size-4" />
          {flow.t('dialog.backToList')}
        </Button>
      )}
      <p className="text-sm text-default-500">
        {flow.t(`kind.${current.kind}`)}
        {current.firmware?.version ? ` · v${current.firmware.version}` : ''}
      </p>
      {flow.needsChoice && <ModeStep flow={flow} />}
      <ProofStep {...props} />
    </div>
  );
}

export function PairingResult({ flow, current }: Readonly<{ flow: PairingFlow; current: PairingDto }>) {
  const { t } = flow;
  return (
    <div className="flex flex-col gap-1" data-cy="attractap-pairing-result">
      <p>{t(`dialog.${current.state}`)}</p>
      {current.failureReason && (
        <p className="text-sm text-default-500" data-cy="attractap-pairing-failure-reason">
          {t(`dialog.reason.${current.failureReason}`)}
        </p>
      )}
    </div>
  );
}
