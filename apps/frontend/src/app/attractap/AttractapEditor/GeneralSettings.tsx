import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Input, Label, Slider, SliderFill, SliderThumb, SliderTrack, TextField } from '@heroui/react';
import { useId } from 'react';
import de from './AttractapEditor.de.json';
import en from './AttractapEditor.en.json';

interface GeneralSettingsProps {
  name: string;
  onNameChange: (name: string) => void;
  bleBridge: boolean;
  showLedBrightness: boolean;
  ledBrightness: number;
  onLedBrightnessChange: (brightness: number) => void;
  allowPluginBle: boolean;
  onAllowPluginBleChange: (allow: boolean) => void;
}

export function GeneralSettings(props: Readonly<GeneralSettingsProps>) {
  const { t } = useTranslations({ de, en });
  const allowPluginBleDescriptionId = useId();
  return (
    <div className="flex flex-col gap-4">
      <TextField value={props.name} onChange={props.onNameChange} className="w-full">
        <Label>{t('readerName')}</Label>
        <Input placeholder={t('enterReaderName')} data-cy="attractap-editor-name-input" />
      </TextField>
      {props.bleBridge && <p className="text-sm text-default-500">{t('bleBridgeDescription')}</p>}
      {props.showLedBrightness && (
        <Slider
          step={1}
          minValue={0}
          maxValue={255}
          value={props.ledBrightness}
          onChange={(val) => props.onLedBrightnessChange(val as number)}
          className="w-full"
          data-cy="attractap-editor-led-brightness-slider"
        >
          <Label>{t('ledBrightness')}</Label>
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
      )}
      <div className="flex flex-col gap-1">
        <LabeledSwitch
          isSelected={props.allowPluginBle}
          onChange={props.onAllowPluginBleChange}
          aria-describedby={allowPluginBleDescriptionId}
          data-cy="attractap-editor-allow-plugin-ble-switch"
        >
          {t('allowPluginBle')}
        </LabeledSwitch>
        <p id={allowPluginBleDescriptionId} className="text-sm text-default-500">
          {t('allowPluginBleDescription')}
        </p>
      </div>
    </div>
  );
}
