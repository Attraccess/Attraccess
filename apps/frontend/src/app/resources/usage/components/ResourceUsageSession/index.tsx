import { HTMLAttributes, useCallback, useMemo } from 'react';
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
  useResourcesServiceResourceUsageGetActiveSessionKey,
  useResourcesServiceResourceUsageCanControlKey,
  Resource,
  useResourcesServiceResourceUsageCanControl,
  useResourceMaintenancesServiceFindMaintenances,
  SupervisionMode,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useSSE } from '../../../../../utils/sse';
import en from './translations/en.json';
import de from './translations/de.json';
import { MaintenanceInProgressDisplay } from './maintenance';
import { FlatSection } from '../../../../../components/flatSection';
import { RequestMaintenanceButton } from '../../../details/maintenance-management/request';
import { InstantMaintenanceButton } from '../../../details/maintenance-management/instant';

// ponytail: only these 3 events affect session/control state; health and other events don't need a refetch
const SESSION_EVENTS = new Set(['resource.usage.session_started', 'resource.usage.session_ended', 'resource.usage.session_taken_over']);

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
  const canUpdateResources = hasPermission('resources.update');
  const queryClient = useQueryClient();

  const invalidateSessionQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [useResourcesServiceResourceUsageGetActiveSessionKey] });
    queryClient.invalidateQueries({ queryKey: [useResourcesServiceResourceUsageCanControlKey] });
  }, [queryClient]);

  useSSE({
    path: `/api/resources/${resourceId}/events`,
    onUpdate: (data: { eventType?: string; inUse?: boolean }) => {
      if (data.eventType && SESSION_EVENTS.has(data.eventType)) {
        invalidateSessionQueries();
      }
    },
  });

  const { data: access, isLoading: isLoadingIntroStatus } = useResourcesServiceResourceUsageCanControl(
    { resourceId },
    undefined,
  );

  const { data: introducers, isLoading: isLoadingIntroducers } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  const { data: activeSessionResponse, isLoading: isLoadingSession } = useResourcesServiceResourceUsageGetActiveSession(
    { resourceId },
    undefined,
  );

  const activeSession = useMemo(() => activeSessionResponse?.usage, [activeSessionResponse]);

  const isLoading = isLoadingSession || isLoadingIntroStatus || isLoadingIntroducers;

  const isIntroducer = useMemo(() => {
    return introducers?.some((introducer) => introducer.userId === user?.id);
  }, [introducers, user]);

  const canStartSession = canUpdateResources || access?.canControl || isIntroducer;

  // A not-introduced user may still start via a supervisor when the resource allows it.
  // The stricter supervision_required case is decided inside StartSessionControls, so that every
  // call site of those controls gets it — including the maintenance view (ATT-815).
  const supervisionEnabled =
    resource.supervisionMode === SupervisionMode.SUPERVISION_ALLOWED ||
    resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED;

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

    if (!canStartSession && !supervisionEnabled) {
      return <IntroductionRequiredDisplay resourceId={resourceId} />;
    }

    if (activeMaintenances?.data?.length && activeMaintenances.data.length > 0) {
      return <MaintenanceInProgressDisplay resourceId={resourceId} />;
    }

    return (
      <StartSessionControls
        resourceId={resourceId}
        insufficientBalanceDesiredAmount={insufficientBalanceDesiredAmount}
        requiresSupervision={!canStartSession}
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
