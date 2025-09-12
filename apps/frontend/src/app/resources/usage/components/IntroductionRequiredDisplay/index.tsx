import { Alert, Divider, Spinner } from '@heroui/react';
import { Users } from 'lucide-react';
import { useTranslations, AttraccessUser } from '@attraccess/plugins-frontend-ui';
import { useAccessControlServiceResourceIntroducersGetMany } from '@attraccess/react-query-client';
import en from './translations/en.json';
import de from './translations/de.json';

interface IntroductionRequiredDisplayProps {
  resourceId: number;
}

export function IntroductionRequiredDisplay({ resourceId }: Readonly<IntroductionRequiredDisplayProps>) {
  const { t } = useTranslations({ en, de });

  // Get list of users who can give introductions
  const { data: introducers, isLoading: isLoadingIntroducers } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  if (isLoadingIntroducers) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="md" color="primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert color="warning">{t('needsIntroduction')}</Alert>

      {introducers && introducers.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center mb-2">
            <Users className="w-4 h-4 mr-1" />
            {t('availableIntroducers')}:
          </p>
          <Divider className="my-2" />
          <div className="space-y-2 mt-2">
            {introducers?.map((introducer) => (
              <AttraccessUser key={introducer.id} user={introducer.user} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-gray-500 dark:text-gray-400 italic">{t('noIntroducersAvailable')}</p>
      )}
    </div>
  );
}
