import { Accordion } from '@heroui/react';
import { useState } from 'react';
import { useWagoTranslations } from '../i18n';
import { NetworkChangeForm } from './NetworkChangeForm';

export function NetworkChangeDetails({ controllerId }: { controllerId: number }) {
  const { t } = useWagoTranslations();
  const [expanded, setExpanded] = useState(false);
  return (
    <Accordion>
      <Accordion.Item onExpandedChange={setExpanded}>
        <Accordion.Heading>
          <Accordion.Trigger>
            {t('networkChange.advanced')}
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            {expanded && <NetworkChangeForm key={controllerId} controllerId={controllerId} />}
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
