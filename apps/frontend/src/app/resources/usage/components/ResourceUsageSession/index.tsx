import { useMemo } from 'react';
import { Card, CardBody, CardHeader, Spinner } from '@heroui/react';
import { Clock } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../../hooks/useAuth';
import { ActiveSessionDisplay } from '../ActiveSessionDisplay';
import { OtherUserSessionDisplay } from '../OtherUserSessionDisplay';
import { IntroductionRequiredDisplay } from '../IntroductionRequiredDisplay';
import { StartSessionControls } from '../StartSessionControls';
import {
  useAccessControlServiceResourceIntroducersGetMany,
  useResourcesServiceResourceUsageGetActiveSession,
  Resource,
  useResourcesServiceResourceUsageCanControl,
  useResourceMaintenancesServiceFindMaintenances,
} from '@attraccess/react-query-client';
import * as en from './translations/en.json';
import * as de from './translations/de.json';
import { MaintenanceInProgressDisplay } from './maintenance';

type ResourceUsageSessionProps = {
  resourceId: number;
  resource: Resource;
} & Omit<React.ComponentProps<typeof Card>, 'resource'>;

export function ResourceUsageSession({ resourceId, resource, ...rest }: ResourceUsageSessionProps) {
  const { t } = useTranslations('resourceUsageSession', { en, de });
  const { hasPermission, user } = useAuth();
  const canManageResources = hasPermission('canManageResources');

  // Check if user has completed the introduction
  const { data: access, isLoading: isLoadingIntroStatus } = useResourcesServiceResourceUsageCanControl(
    { resourceId },
    undefined,
    {
      refetchInterval: 3000,
    }
  );

  // Get list of users who can give introductions
  const { data: introducers, isLoading: isLoadingIntroducers } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  // Get active session
  const { data: activeSessionResponse, isLoading: isLoadingSession } = useResourcesServiceResourceUsageGetActiveSession(
    { resourceId },
    undefined,
    {
      refetchInterval: 3000,
    }
  );

  const activeSession = useMemo(() => activeSessionResponse?.usage, [activeSessionResponse]);

  const isLoading = isLoadingSession ?? isLoadingIntroStatus ?? isLoadingIntroducers;

  const isIntroducer = useMemo(() => {
    return introducers?.some((introducer) => introducer.userId === user?.id);
  }, [introducers, user]);

  // Users with canManageResources permission can always start a session
  const canStartSession = canManageResources || access?.canControl || isIntroducer;

  const { data: activeMaintenances } = useResourceMaintenancesServiceFindMaintenances({
    resourceId,
    includeActive: true,
  });

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-4">
          <Spinner size="md" color="primary" />
        </div>
      );
    }

    if (activeSession) {
      // Check if the active session belongs to the current user
      if (activeSession.userId === user?.id) {
        // Current user's active session: Show timer and End button
        return <ActiveSessionDisplay resourceId={resourceId} startTime={activeSession.startTime} />;
      } else {
        // Active session belongs to another user: Show info message
        return <OtherUserSessionDisplay resourceId={resourceId} />;
      }
    }

    if (!canStartSession) {
      return <IntroductionRequiredDisplay resourceId={resourceId} />;
    }

    if (activeMaintenances?.data?.length && activeMaintenances.data.length > 0) {
      return <MaintenanceInProgressDisplay resourceId={resourceId} />;
    }

    return <StartSessionControls resourceId={resourceId} />;
  };

  return (
    <Card {...rest}>
      <CardHeader>
        <div className="flex items-center">
          <Clock className="w-5 h-5 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('usageSession')}: </h3>
        </div>
      </CardHeader>
      <CardBody>{renderContent()}</CardBody>
    </Card>
  );
}
