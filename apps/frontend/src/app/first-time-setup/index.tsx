import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Accordion, AccordionItem, Selection, Spinner } from '@heroui/react';
import { CheckCircle2Icon, Settings2Icon } from 'lucide-react';
import { PageHeader } from '../../components/pageHeader';
import { AppSettingsForm } from '../settings/forms/AppSettingsForm';
import { SmtpSettingsForm } from '../settings/forms/SmtpSettingsForm';
import { CreateAdminStep } from './steps/CreateAdminStep';
import { LicenseStep } from './steps/LicenseStep';
import { VerifyEmailStep } from './steps/VerifyEmailStep';
import en from './en.json';
import de from './de.json';
import { useSettingsServiceGetFirstTimeSetupStatus } from '@attraccess/react-query-client';

const WIZARD_STEPS = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'] as const;
type WizardStepKey = (typeof WIZARD_STEPS)[number];

function isWizardStepKey(key: string): key is WizardStepKey {
  return WIZARD_STEPS.includes(key as WizardStepKey);
}

export function FirstTimeSetupPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<WizardStepKey>(WIZARD_STEPS[0]);
  const hasInitializedStep = useRef(false);
  const hasSeenSetupAvailable = useRef(false);
  const [localCompleted, setLocalCompleted] = useState({ url: false, license: false });

  const { data: setupStatus, isLoading: isCheckingSetup } = useSettingsServiceGetFirstTimeSetupStatus();

  if (setupStatus?.available) {
    hasSeenSetupAvailable.current = true;
  }

  const stepCompleted = useMemo(() => {
    const s = setupStatus?.stepsCompleted;
    const serverApp = s?.app ?? false;
    const smtpDone = s?.smtp ?? false;
    const adminDone = s?.admin ?? false;
    return [
      localCompleted.url || serverApp,
      smtpDone,
      localCompleted.license || serverApp,
      adminDone,
      adminDone,
    ] as const;
  }, [setupStatus?.stepsCompleted, localCompleted]);

  const firstIncompleteIndex = useMemo(() => {
    const i = stepCompleted.findIndex((done) => !done);
    return i >= 0 ? i : WIZARD_STEPS.length - 1;
  }, [stepCompleted]);

  useEffect(() => {
    if (!isCheckingSetup && setupStatus && !setupStatus.available && !hasSeenSetupAvailable.current) {
      navigate('/', { replace: true });
    }
  }, [isCheckingSetup, navigate, setupStatus]);

  useEffect(() => {
    if (isCheckingSetup || setupStatus === undefined || hasInitializedStep.current) {
      return;
    }
    hasInitializedStep.current = true;
    setCurrentStep(WIZARD_STEPS[firstIncompleteIndex]);
  }, [isCheckingSetup, firstIncompleteIndex, setupStatus]);

  const goToStep2 = useCallback(() => {
    setLocalCompleted((prev) => ({ ...prev, url: true }));
    setCurrentStep('step-2');
  }, []);
  const goToStep3 = useCallback(() => setCurrentStep('step-3'), []);
  const goToStep4 = useCallback(() => {
    setLocalCompleted((prev) => ({ ...prev, license: true }));
    setCurrentStep('step-4');
  }, []);
  const goToStep5 = useCallback(() => setCurrentStep('step-5'), []);

  const currentStepIndex = WIZARD_STEPS.indexOf(currentStep);

  const handleAccordionSelectionChange = useCallback(
    (keys: Selection) => {
      const keySet = typeof keys === 'string' ? new Set<string>() : keys;
      const newKey = Array.from(keySet)[0];
      if (newKey == null || typeof newKey !== 'string' || !isWizardStepKey(newKey)) return;
      const newIndex = WIZARD_STEPS.indexOf(newKey);
      const goingBack = newIndex < currentStepIndex;
      const goingToNext = newIndex === currentStepIndex + 1;
      const currentDone = stepCompleted[currentStepIndex];
      const allowed = goingBack || (goingToNext && currentDone) || newIndex === currentStepIndex;
      if (allowed) {
        setCurrentStep(newKey);
      }
    },
    [currentStepIndex, stepCompleted]
  );

  if (isCheckingSetup) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Settings2Icon size={20} />}
      />

      <Accordion
        variant="splitted"
        selectionMode="single"
        selectedKeys={new Set([currentStep])}
        onSelectionChange={handleAccordionSelectionChange}
        className="w-full"
      >
        <AccordionItem
          key="step-1"
          aria-label={t('steps.app')}
          title={
            <span className="flex items-center gap-2">
              {stepCompleted[0] && (
                <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden />
              )}
              {t('steps.app')}
            </span>
          }
        >
          <AppSettingsForm variant="wizard" endpoint="first-time-setup" onNext={goToStep2} />
        </AccordionItem>
        <AccordionItem
          key="step-2"
          aria-label={t('steps.smtp')}
          title={
            <span className="flex items-center gap-2">
              {stepCompleted[1] && (
                <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden />
              )}
              {t('steps.smtp')}
            </span>
          }
        >
          <SmtpSettingsForm variant="wizard" endpoint="first-time-setup" onNext={goToStep3} />
        </AccordionItem>
        <AccordionItem
          key="step-3"
          aria-label={t('steps.license')}
          title={
            <span className="flex items-center gap-2">
              {stepCompleted[2] && (
                <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden />
              )}
              {t('steps.license')}
            </span>
          }
        >
          <LicenseStep onSuccess={goToStep4} />
        </AccordionItem>
        <AccordionItem
          key="step-4"
          aria-label={t('steps.admin')}
          title={
            <span className="flex items-center gap-2">
              {stepCompleted[3] && (
                <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden />
              )}
              {t('steps.admin')}
            </span>
          }
        >
          <CreateAdminStep onSuccess={goToStep5} />
        </AccordionItem>
        <AccordionItem
          key="step-5"
          aria-label={t('steps.verify')}
          title={
            <span className="flex items-center gap-2">
              {stepCompleted[4] && (
                <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden />
              )}
              {t('steps.verify')}
            </span>
          }
        >
          <VerifyEmailStep />
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export default FirstTimeSetupPage;
