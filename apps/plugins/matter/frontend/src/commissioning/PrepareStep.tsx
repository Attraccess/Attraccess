import { Button } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import { StepHeading } from './StepHeading';

/** Step 1: what to do at the device before entering its code. Nothing is sent from here. */
export function PrepareStep({ onContinue }: Readonly<{ onContinue: () => void }>) {
  const { t } = useMatterTranslations();
  return (
    <div className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-prepare-step">
      <StepHeading>{t('commissioning.prepare.title')}</StepHeading>
      <ul className="mt:list-disc mt:pl-5 mt:text-sm">
        {(['network', 'window', 'code', 'sharing'] as const).map((item) => (
          <li key={item}>{t(`commissioning.prepare.${item}`)}</li>
        ))}
      </ul>
      <div>
        <Button variant="primary" onPress={onContinue} data-cy="matter-prepare-continue">
          {t('commissioning.prepare.continue')}
        </Button>
      </div>
    </div>
  );
}
