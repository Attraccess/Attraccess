import { Card } from '@heroui/react';
import { PlusCircleIcon } from 'lucide-react';
import { familyAvailability } from '../capabilities';
import { CommissioningFlow } from '../commissioning/CommissioningFlow';
import { FLOW_STEPS } from '../commissioning/StepIndicator';
import { useMatterTranslations } from '../i18n';
import { useMatterConnection } from '../MatterConnectionContext';
import { FamilyNotice } from './FamilyNotice';
import { NotAvailableYet } from './NotAvailableYet';

/**
 * The full-page commissioning flow (never a modal). Visible with `matter.devices.commission`. While the connected
 * sidecar does not report `commissioning` as available, the page says why and renders no input. A user who may not read
 * the connection status gets the flow: the API refuses what the sidecar cannot do. The explanation lists the flow's own
 * steps under their labels in the step indicator.
 */
export function CommissioningTab() {
  const { t } = useMatterTranslations();
  const { status } = useMatterConnection();
  const unavailable = status !== null && familyAvailability(status, 'commissioning') !== 'available';
  return (
    <div className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-commissioning-tab">
      {unavailable ? (
        <>
          <NotAvailableYet
            title={t('commissioning.emptyTitle')}
            icon={<PlusCircleIcon className="mt:h-8 mt:w-8" />}
            dataCy="matter-commissioning-empty"
          >
            <FamilyNotice family="commissioning" />
            <p>{t('commissioning.emptyText')}</p>
          </NotAvailableYet>
          <Card data-cy="matter-commissioning-steps">
            <Card.Header>
              <Card.Title>{t('commissioning.stepsTitle')}</Card.Title>
            </Card.Header>
            <Card.Content>
              <ol className="mt:flex mt:list-decimal mt:flex-col mt:gap-3 mt:pl-5">
                {FLOW_STEPS.map((step) => (
                  <li key={step}>
                    <span className="mt:font-medium">{t(`commissioning.flow.${step}`)}</span>
                    <span className="mt:block mt:text-sm mt:text-muted">{t(`commissioning.steps.${step}.text`)}</span>
                  </li>
                ))}
              </ol>
            </Card.Content>
          </Card>
        </>
      ) : (
        <CommissioningFlow />
      )}
    </div>
  );
}
