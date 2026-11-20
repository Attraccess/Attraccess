import { Card } from '@heroui/react';
import { PlusCircleIcon } from 'lucide-react';
import { useMatterTranslations } from '../i18n';
import { FamilyNotice } from './FamilyNotice';
import { NotAvailableYet } from './NotAvailableYet';

const STEPS = ['prepare', 'code', 'progress', 'claim'] as const;

/**
 * The full-page commissioning flow (ATT-1002 fills it; never a modal). Today it only explains the steps: no setup code
 * is collected or sent, and nothing here renders an input that pretends to work. Visible with
 * `matter.devices.commission`.
 */
export function CommissioningTab() {
  const { t } = useMatterTranslations();
  return (
    <div className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-commissioning-tab">
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
            {STEPS.map((step) => (
              <li key={step}>
                <span className="mt:font-medium">{t(`commissioning.steps.${step}.title`)}</span>
                <span className="mt:block mt:text-sm mt:text-muted">{t(`commissioning.steps.${step}.text`)}</span>
              </li>
            ))}
          </ol>
        </Card.Content>
      </Card>
    </div>
  );
}
