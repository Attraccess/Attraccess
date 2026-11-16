import { Input, Label, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMemo } from 'react';
import { Select } from '../../../components/select';
import { Choice, PairingFlow } from './usePairingFlow';
import de from './de.json';
import en from './en.json';

const NAME_MAX_LENGTH = 64;

const MODES: Choice[] = ['new', 'takeover'];

/** New reader (optional name) or a takeover of an existing record. */
export function ModeStep({ flow }: Readonly<{ flow: PairingFlow }>) {
  const { t } = useTranslations({ de, en });
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
