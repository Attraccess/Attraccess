import { Button } from '@heroui/react';
import { useWagoTranslations } from '../../i18n';
import { purposes, type Purpose } from './channelWorkspaceModel';

interface AddChannelPurposeStepProps {
  purpose: Purpose;
  onPurposeChange: (purpose: Purpose) => void;
  onExternal: () => void;
}

export function AddChannelPurposeStep({ purpose, onPurposeChange, onExternal }: AddChannelPurposeStepProps) {
  const { t } = useWagoTranslations();
  return (
    <>
      <div className="wg:grid wg:gap-3 wg:sm:grid-cols-2">
        {purposes.map((item) => (
          <Button
            key={item.id}
            variant={purpose === item.id ? 'secondary' : 'outline'}
            aria-pressed={purpose === item.id}
            className="wg:h-auto wg:w-full wg:justify-start wg:whitespace-normal wg:p-4 wg:text-left"
            onPress={() => onPurposeChange(item.id)}
          >
            <item.icon className="wg:size-5 wg:shrink-0" />
            <span>
              <strong className="wg:block">{t(`channels.purposes.${item.id}.label`)}</strong>
              <span className="wg:font-normal wg:text-muted">{t(`channels.purposes.${item.id}.description`)}</span>
            </span>
          </Button>
        ))}
      </div>
      <p className="wg:text-sm wg:text-muted">{t('channels.externalHint')}</p>
      <Button variant="ghost" onPress={onExternal}>
        {t('channels.external')}
      </Button>
    </>
  );
}
