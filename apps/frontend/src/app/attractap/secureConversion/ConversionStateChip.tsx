import { Chip } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { AttractapConversionState } from '@attraccess/react-query-client';
import { stateColor } from './conversionStates';
import de from './de.json';
import en from './en.json';

/** The step a "Secure this reader" run is in. */
export function ConversionStateChip(props: Readonly<{ state: AttractapConversionState }>) {
  const { t } = useTranslations({ de, en });
  return (
    <Chip size="sm" variant="soft" color={stateColor(props.state)} data-cy={`secure-conversion-state-${props.state}`}>
      {t(`state.${props.state}`)}
    </Chip>
  );
}
