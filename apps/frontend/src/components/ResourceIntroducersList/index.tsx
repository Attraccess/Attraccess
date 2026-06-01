import { Separator, Spinner } from '@heroui/react';
import { Users } from 'lucide-react';
import { useTranslations, AttraccessUser } from '@attraccess/plugins-frontend-ui';
import { useAccessControlServiceResourceIntroducersGetMany } from '@attraccess/react-query-client';

import de from './de.json';
import en from './en.json';

export interface ResourceIntroducersListProps {
  resourceId: number;
  /** Heading shown above the list. Defaults to translated "Available Introducers". */
  title?: string;
  /** Shown when no introducers exist. Defaults to translated message. */
  emptyText?: string;
}

/**
 * Shared list of users who are allowed to introduce others to (and perform
 * maintenance on) a resource. Used on the "introduction required" and
 * "maintenance in progress" displays so a blocked user can see who to contact.
 */
export function ResourceIntroducersList({ resourceId, title, emptyText }: Readonly<ResourceIntroducersListProps>) {
  const { t } = useTranslations({ en, de });

  const { data: introducers, isLoading } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner color="accent" />
      </div>
    );
  }

  if (!introducers || introducers.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400 italic">{emptyText ?? t('empty')}</p>;
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center mb-2">
        <Users className="w-4 h-4 mr-1" />
        {title ?? t('title')}:
      </p>
      <Separator className="my-2" />
      <div className="space-y-2 mt-2">
        {introducers.map((introducer) => (
          <AttraccessUser key={introducer.id} user={introducer.user} />
        ))}
      </div>
    </div>
  );
}
