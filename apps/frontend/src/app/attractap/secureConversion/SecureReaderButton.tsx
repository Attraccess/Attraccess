import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ShieldCheckIcon } from 'lucide-react';
import de from './de.json';
import en from './en.json';

interface Props {
  /** Why the reader cannot be secured now: server blocker codes, or `missing-permission`. Empty: enabled. */
  blockers: readonly string[];
  onPress: () => void;
}

/** "Secure this reader": disabled with a tooltip naming every reason while a gate is not met. */
export function SecureReaderButton({ blockers, onPress }: Readonly<Props>) {
  const { t } = useTranslations({ de, en });
  // Hover and keyboard focus open the tooltip by themselves; a tap on a touch screen does not, so a press opens it.
  const [isOpen, setOpen] = useState(false);
  const button = (
    <Button
      className="shrink-0"
      variant="secondary"
      isDisabled={blockers.length > 0}
      onPress={onPress}
      data-cy="secure-conversion-button"
    >
      <ShieldCheckIcon size={16} />
      {t('button')}
    </Button>
  );
  if (blockers.length === 0) return button;
  return (
    <Tooltip isOpen={isOpen} onOpenChange={setOpen}>
      <TooltipTrigger tabIndex={0} onClick={() => setOpen(true)} data-cy="secure-conversion-button-blocked">
        {button}
      </TooltipTrigger>
      <TooltipContent>
        <ul className="flex flex-col gap-1" data-cy="secure-conversion-blockers">
          {blockers.map((blocker) => (
            <li key={blocker}>{t(`blocker.${blocker}`)}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
