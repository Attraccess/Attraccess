import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MillimetreField } from './MillimetreField';
import {
  CABLE_CUTOUT_HEIGHT_LIMITS,
  cordOpeningLimits,
  HEIGHT_ABOVE_PLUG_LIMITS,
  isAngled,
  type PlugConfig,
} from './smartPlugConfig';
import de from './de.json';
import en from './en.json';

interface PlugCableFieldsProps {
  config: PlugConfig;
  onChange: (change: Partial<PlugConfig>) => void;
}

/** The cable-dependent dimensions: the opening for a straight cable, the two heights for an angled one. */
export function PlugCableFields({ config, onChange }: PlugCableFieldsProps) {
  const { t } = useTranslations({ de, en });

  if (!isAngled(config.cable)) {
    return (
      <MillimetreField
        label={t('cordOpeningDiameter')}
        description={t('cordOpeningDiameterDescription')}
        value={config.cordOpeningDiameter}
        onChange={(cordOpeningDiameter) => onChange({ cordOpeningDiameter })}
        limits={cordOpeningLimits(config.cable)}
        data-cy="printables-plug-opening"
      />
    );
  }

  return (
    <>
      <MillimetreField
        label={t('heightAbovePlug')}
        description={t('heightAbovePlugDescription')}
        value={config.heightAbovePlug}
        onChange={(heightAbovePlug) => onChange({ heightAbovePlug })}
        limits={HEIGHT_ABOVE_PLUG_LIMITS}
        data-cy="printables-plug-height"
      />
      <MillimetreField
        label={t('cableCutoutHeight')}
        description={t('cableCutoutHeightDescription')}
        value={config.cableCutoutHeight}
        onChange={(cableCutoutHeight) => onChange({ cableCutoutHeight })}
        limits={CABLE_CUTOUT_HEIGHT_LIMITS}
        data-cy="printables-plug-cutout"
      />
    </>
  );
}
