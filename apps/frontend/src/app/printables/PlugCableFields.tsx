import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MillimetreField } from './MillimetreField';
import {
  CABLE_CUTOUT_HEIGHT_LIMITS,
  cordOpeningLimits,
  heightAbovePlugLimits,
  isAngled,
  type PlugConfig,
} from './smartPlugConfig';
import de from './de.json';
import en from './en.json';

interface PlugCableFieldsProps {
  config: PlugConfig;
  onChange: (change: Partial<PlugConfig>) => void;
}

/**
 * The cable-dependent dimensions: the height above the plug for every cable, plus the opening
 * for a straight cable or the cable cutout for an angled one.
 */
export function PlugCableFields({ config, onChange }: PlugCableFieldsProps) {
  const { t } = useTranslations({ de, en });
  const angled = isAngled(config.cable);

  const height = (
    <MillimetreField
      label={t('heightAbovePlug')}
      description={t(angled ? 'heightAbovePlugDescription' : 'heightAbovePlugStraightDescription')}
      value={config.heightAbovePlug}
      onChange={(heightAbovePlug) => onChange({ heightAbovePlug })}
      limits={heightAbovePlugLimits(config.cable)}
      data-cy="printables-plug-height"
    />
  );

  if (!angled) {
    return (
      <>
        <MillimetreField
          label={t('cordOpeningDiameter')}
          description={t('cordOpeningDiameterDescription')}
          value={config.cordOpeningDiameter}
          onChange={(cordOpeningDiameter) => onChange({ cordOpeningDiameter })}
          limits={cordOpeningLimits(config.cable)}
          data-cy="printables-plug-opening"
        />
        {height}
      </>
    );
  }

  return (
    <>
      {height}
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
