import { Button } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PairingFlow } from './usePairingFlow';
import de from './de.json';
import en from './en.json';
import { CodeField } from './CodeField';

/** Asks for the code when the request is not known yet; Lite readers can be picked from the waiting list. */
export function FindStep(props: Readonly<{ flow: PairingFlow; insecure: boolean; presetTargetReaderId?: number }>) {
  const { flow, presetTargetReaderId } = props;
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  const targetName = flow.readers?.find((reader) => reader.id === presetTargetReaderId)?.name;
  const waitingLite = presetTargetReaderId ? flow.running.filter((p) => p.kind === 'lite' && !p.mode) : [];
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
