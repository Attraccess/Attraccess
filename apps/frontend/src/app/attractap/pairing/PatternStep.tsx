import { ColorSwatch, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PairingDto } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

type LedColour = 'red' | 'green' | 'blue' | 'yellow' | 'white' | 'magenta';

// Close to what the WS2812 ring shows (yellow is the firmware's 255/200/0), so swatch and ring look alike.
const SWATCH: Record<LedColour, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffc800',
  white: '#ffffff',
  magenta: '#ff00ff',
};

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

export function PatternStep({ current }: Readonly<{ current: PairingDto }>) {
  const { t } = useTranslations({ de, en });
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
