import { Button, Card, cn } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import { HTMLAttributes } from 'react';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { MarkDoneModal } from './mark-done';
import { CheckCircleIcon, ConstructionIcon } from 'lucide-react';
import { EmptyState } from '../../../../components/emptyState';
import { FlatSection } from '../../../../components/flatSection';
import { useMaintenanceManagementState } from './useMaintenanceManagementState';

export interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  resourceId: number;
  variant?: 'card' | 'flat';
}

export function MaintenanceManagement(props: Props) {
  const {
    resourceId,
    variant,
    className,
    htmlProps,
    t,
    maintenanceWithStatus,
    cardActions,
    flatActions,
    includePastSwitch,
    tableContent,
  } = useMaintenanceManagementState(props);

  if (variant === 'flat') {
    return (
      <FlatSection
        icon={<ConstructionIcon className="w-4 h-4" />}
        title={t('title')}
        actions={flatActions}
        className={className}
        {...htmlProps}
      >
        {maintenanceWithStatus.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="text-sm divide-y divide-divider">
            {maintenanceWithStatus.map((maintenance) => (
              <li
                key={maintenance.id}
                className={cn(
                  'flex items-start justify-between gap-3 py-2',
                  maintenance.isActive && 'border-l-4 border-l-warning pl-2',
                  maintenance.isPast && 'line-through opacity-60',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-foreground-700 text-xs whitespace-nowrap overflow-hidden text-ellipsis">
                    <DateTimeDisplay date={maintenance.startTime} />
                    {maintenance.endTime && (
                      <>
                        {' – '}
                        <DateTimeDisplay date={maintenance.endTime} />
                      </>
                    )}
                  </div>
                  <div className="text-foreground truncate">
                    <MaintenanceReasonDisplay reason={maintenance.reason} />
                  </div>
                </div>
                {maintenance.isActive && (
                  <MarkDoneModal resourceId={resourceId} maintenanceId={maintenance.id}>
                    {(openMarkDone: () => void) => (
                      <Button variant="tertiary" isIconOnly onPress={openMarkDone}>
                        <CheckCircleIcon className="w-4 h-4" />
                      </Button>
                    )}
                  </MarkDoneModal>
                )}
              </li>
            ))}
          </ul>
        )}
      </FlatSection>
    );
  }

  return (
    <Card className={className} {...htmlProps}>
      <Card.Header>
        <PageHeader title={t('title')} icon={<ConstructionIcon />} noMargin actions={cardActions} />
      </Card.Header>

      <Card.Content>
        {includePastSwitch}
        {tableContent}
      </Card.Content>
    </Card>
  );
}
