import { Button } from '@heroui/react';
import { ArrowLeftIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PairingDto } from '@attraccess/react-query-client';
import { PairingFlow } from './usePairingFlow';
import de from './de.json';
import en from './en.json';
import { ModeStep } from './ModeStep';
import { ProofStep } from './ProofStep';
import { readerTypeOf } from './PairingRow';

export function ReaderStep(props: Readonly<{ flow: PairingFlow; current: PairingDto; insecure: boolean }>) {
  const { flow, current } = props;
  const { t } = useTranslations({ de, en });
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
          {t('dialog.backToList')}
        </Button>
      )}
      <p className="text-sm text-default-500">
        {t(`kind.${readerTypeOf(current.firmware, current.kind)}`)}
        {current.firmware?.version ? ` · v${current.firmware.version}` : ''}
      </p>
      {flow.needsChoice && <ModeStep flow={flow} />}
      <ProofStep {...props} />
    </div>
  );
}
