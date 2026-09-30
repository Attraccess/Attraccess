import { memo } from 'react';
import { History } from 'lucide-react';
import { ShowAllUsersToggle } from '../ShowAllUsersToggle';

interface HistoryHeaderProps {
  title: string;
  showAllUsers: boolean;
  setShowAllUsers: (value: boolean) => void;
  canUpdateResources: boolean;
}

export const HistoryHeader = memo(
  ({ title, showAllUsers, setShowAllUsers, canUpdateResources }: HistoryHeaderProps) => {
    return (
      <div className="flex items-center justify-between gap-x-4 gap-y-4 flex-wrap">
        <div className="flex items-center">
          <History className="w-5 h-5 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        {canUpdateResources && (
          <ShowAllUsersToggle showAllUsers={showAllUsers} setShowAllUsers={setShowAllUsers} />
        )}
      </div>
    );
  },
);

HistoryHeader.displayName = 'HistoryHeader';
