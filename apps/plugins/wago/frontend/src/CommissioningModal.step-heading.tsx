import { useWagoTranslations } from './i18n';

export function StepHeading({ step, identity, failed }: { step: number; identity: boolean; failed: boolean }) {
  const { t } = useWagoTranslations();
  return (
    <div>
      <p className="wg:text-sm wg:font-medium">{t('commissioningUI.step', { step: step + 1 })}</p>
      <h2 className="wg:mt-1 wg:text-xl wg:font-semibold">
        {t(
          failed
            ? 'commissioningUI.setupFailed'
            : identity
              ? 'commissioningUI.verifyController'
              : `commissioningUI.steps.${step}.title`,
        )}
      </h2>
      <p className="wg:mt-1 wg:text-sm wg:text-muted">
        {t(
          failed
            ? 'commissioningUI.failureIntro'
            : identity
              ? 'commissioningUI.isolatedConnectionHint'
              : `commissioningUI.steps.${step}.description`,
        )}
      </p>
    </div>
  );
}
