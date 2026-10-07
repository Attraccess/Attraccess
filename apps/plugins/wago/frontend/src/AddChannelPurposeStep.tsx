import { Button } from '@heroui/react';
import { purposes } from './ChannelWorkspace.purposes';
import type { useAddChannelState } from './useAddChannelState';
type Props = Pick<ReturnType<typeof useAddChannelState>, 'step' | 't' | 'purpose' | 'setPurpose' | 'onExternal'>;
export function AddChannelPurposeStep({ step, t, purpose, setPurpose, onExternal }: Props) {
  return (
    <>
      {step === 0 && (
        <>
          <div className="wg:grid wg:gap-3 wg:sm:grid-cols-2">
            {purposes.map((item) => (
              <Button
                key={item.id}
                variant={purpose === item.id ? 'secondary' : 'outline'}
                aria-pressed={purpose === item.id}
                className="wg:h-auto wg:w-full wg:justify-start wg:whitespace-normal wg:p-4 wg:text-left"
                onPress={() => setPurpose(item.id)}
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
      )}
    </>
  );
}
