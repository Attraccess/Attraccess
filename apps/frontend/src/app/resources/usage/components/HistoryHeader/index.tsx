import { memo } from 'react';
import { Checkbox } from '@heroui/react';
import { History, Users } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en';
import de from './translations/de';

interface HistoryHeaderProps {
  title: string;
  showAllUsers: boolean;
  setShowAllUsers: (value: boolean) => void;
  canManageResources: boolean;
}

export const HistoryHeader = memo(
  ({ title, showAllUsers, setShowAllUsers, canManageResources }: HistoryHeaderProps) => {
    const { t } = useTranslations({ en, de });

    return (
      <div className="flex items-center justify-between gap-x-4 gap-y-4 flex-wrap">
        <div className="flex items-center">
          <History className="w-5 h-5 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        {canManageResources && (
          <div className="flex items-center">
            <Checkbox isSelected={showAllUsers} onValueChange={setShowAllUsers} size="sm" />
            <span className="ml-2 text-sm flex items-center">
              <Users className="w-4 h-4 mr-1" /> {t('showAllUsers')}
            </span>
          </div>
        )}
      </div>
    );
  },
);

HistoryHeader.displayName = 'HistoryHeader';
