import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceIntroducersList } from '../../../../../components/ResourceIntroducersList';
import { ResourceIntroducerType } from '@attraccess/react-query-client';
import en from './translations/en.json';
import de from './translations/de.json';

interface IntroductionRequiredDisplayProps {
  resourceId: number;
}

export function IntroductionRequiredDisplay({ resourceId }: Readonly<IntroductionRequiredDisplayProps>) {
  const { t } = useTranslations({ en, de });

  return (
    <div className="space-y-4">
      <Alert status="warning">
        <AlertStatusIcon status="warning" />
        <AlertContent>
          <AlertDescription>{t('needsIntroduction')}</AlertDescription>
        </AlertContent>
      </Alert>

      <ResourceIntroducersList
        resourceId={resourceId}
        title={t('availableIntroducers')}
        type={ResourceIntroducerType.INTRODUCER}
      />
    </div>
  );
}
