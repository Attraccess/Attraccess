import { HTMLAttributes, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { History } from 'lucide-react';
import { ResourceUsage } from '@attraccess/react-query-client';
import { HistoryTable } from './components/HistoryTable';
import { UsageNotesModal } from './components/UsageNotesModal';
import { ShowAllUsersToggle } from './components/ShowAllUsersToggle';
import en from './translations/resourceUsageHistory.en';
import de from './translations/resourceUsageHistory.de';
import historyTableEn from './components/HistoryTable/utils/translations/en.json';
import historyTableDe from './components/HistoryTable/utils/translations/de.json';
import { FlatSection } from '../../../components/flatSection';
import { useCanViewOperatingDuration } from '../operatingDuration';
import { useUsageSessionProject } from './hooks/useUsageSessionProject';

type ResourceUsageHistoryProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  resourceId: number;
  hideHeader?: boolean;
};

export function ResourceUsageHistory({ resourceId, hideHeader, ...rest }: ResourceUsageHistoryProps) {
  const { t } = useTranslations({ en, de });
  const { t: tHistoryTable } = useTranslations({ en: historyTableEn, de: historyTableDe });
  const { hasPermission } = useAuth();
  const canUpdateResources = hasPermission('resources.update');
  const canViewOperatingDuration = useCanViewOperatingDuration(resourceId);
  const { resolveProjectId, updatingSessionIds, handleProjectChange } = useUsageSessionProject(resourceId);

  const [showAllUsers, setShowAllUsers] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUsageId, setSelectedUsageId] = useState<number | null>(null);
  const handleSessionClick = (session: ResourceUsage) => {
    setSelectedUsageId(session.id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const showAllUsersToggle = canUpdateResources ? (
    <ShowAllUsersToggle showAllUsers={showAllUsers} setShowAllUsers={setShowAllUsers} />
  ) : undefined;

  const table = (
    <HistoryTable
      resourceId={resourceId}
      showAllUsers={showAllUsers}
      canUpdateResources={canUpdateResources}
      onSessionClick={handleSessionClick}
      projectPlaceholder={tHistoryTable('rows.machine.project.unassigned')}
      resolveProjectId={resolveProjectId}
      updatingSessionIds={updatingSessionIds}
      onProjectChange={handleProjectChange}
      canViewOperatingDuration={canViewOperatingDuration}
    />
  );

  const notesModal = (
    <UsageNotesModal
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      resourceId={resourceId}
      usageId={selectedUsageId}
    />
  );

  if (hideHeader) {
    return (
      <section {...rest}>
        {showAllUsersToggle ? <div className="flex justify-end mb-4">{showAllUsersToggle}</div> : null}
        {table}
        {notesModal}
      </section>
    );
  }

  return (
    <FlatSection
      icon={<History className="w-4 h-4" />}
      title={t('usageHistory')}
      actions={showAllUsersToggle}
      {...rest}
    >
      {table}
      {notesModal}
    </FlatSection>
  );
}
