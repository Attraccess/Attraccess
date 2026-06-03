import { HTMLAttributes, useMemo } from 'react';
import { Spinner } from '@heroui/react';
import { Clock } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../../hooks/useAuth';
import { ActiveSessionDisplay } from '../ActiveSessionDisplay';
import { OtherUserSessionDisplay } from '../OtherUserSessionDisplay';
import { IntroductionRequiredDisplay } from '../IntroductionRequiredDisplay';
import { RetrainingStatusBanner } from '../RetrainingStatusBanner';
import { StartSessionControls } from '../StartSessionControls';
import {
  useAccessControlServiceResourceIntroducersGetMany,
  useResourcesServiceResourceUsageGetActiveSession,
  Resource,
  useResourcesServiceResourceUsageCanControl,
  useResourceMaintenancesServiceFindMaintenances,
} from '@attraccess/react-query-client';
import en from './translations/en.json';
import de from './translations/de.json';
import { MaintenanceInProgressDisplay } from './maintenance';
import { FlatSection } from '../../../../../components/flatSection';
import { RequestMaintenanceButton } from '../../../details/maintenance-management/request';
import { InstantMaintenanceButton } from '../../../details/maintenance-management/instant';

type ResourceUsageSessionProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'resource'> & {
  resourceId: number;
  resource: Resource;
  insufficientBalanceDesiredAmount?: number;
};

export function ResourceUsageSession({
  resourceId,
  resource,
  insufficientBalanceDesiredAmount,
  ...rest
}: ResourceUsageSessionProps) {
  const { t } = useTranslations({ en, de });
  const { hasPermission, user } = useAuth();
  const canManageResources = hasPermission('canManageResources');

  const { data: access, isLoading: isLoadingIntroStatus } = useResourcesServiceResourceUsageCanControl(
    { resourceId },
    undefined,
    {
      refetchInterval: 3000,
    },
  );

  const { data: introducers, isLoading: isLoadingIntroducers } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  const { data: activeSessionResponse, isLoading: isLoadingSession } = useResourcesServiceResourceUsageGetActiveSession(
    { resourceId },
    undefined,
    {
      refetchInterval: 3000,
    },
  );

  const activeSession = useMemo(() => activeSessionResponse?.usage, [activeSessionResponse]);

  const isLoading = isLoadingSession ?? isLoadingIntroStatus ?? isLoadingIntroducers;

  const isIntroducer = useMemo(() => {
    return introducers?.some((introducer) => introducer.userId === user?.id);
  }, [introducers, user]);

  const canStartSession = canManageResources || access?.canControl || isIntroducer;

  const { data: activeMaintenances } = useResourceMaintenancesServiceFindMaintenances({
    resourceId,
    includeActive: true,
  });

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-4">
          <Spinner color="accent" />
        </div>
      );
    }

    if (activeSession) {
      if (activeSession.userId === user?.id) {
        return <ActiveSessionDisplay resourceId={resourceId} startTime={activeSession.startTime} />;
      } else {
        return <OtherUserSessionDisplay resourceId={resourceId} />;
      }
    }

    if (!canStartSession) {
      return <IntroductionRequiredDisplay resourceId={resourceId} />;
    }

    if (activeMaintenances?.data?.length && activeMaintenances.data.length > 0) {
      return <MaintenanceInProgressDisplay resourceId={resourceId} />;
    }

    return (
      <StartSessionControls
        resourceId={resourceId}
        insufficientBalanceDesiredAmount={insufficientBalanceDesiredAmount}
      />
    );
  };

  return (
    <FlatSection icon={<Clock className="w-4 h-4" />} title={t('title.' + resource.type)} {...rest}>
      <div className="space-y-4">
        <RetrainingStatusBanner resourceId={resourceId} />
        {renderContent()}
        {!isLoading && !(activeMaintenances?.data?.length && activeMaintenances.data.length > 0) && (
          <div className="flex justify-end gap-2">
            <RequestMaintenanceButton resourceId={resourceId} />
            <InstantMaintenanceButton resourceId={resourceId} />
          </div>
        )}
      </div>
    </FlatSection>
  );
}
