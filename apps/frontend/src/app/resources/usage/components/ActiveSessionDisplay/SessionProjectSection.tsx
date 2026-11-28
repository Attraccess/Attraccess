import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceUsage, useFindManyProjects } from '@attraccess/react-query-client';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { useNetworkRestriction } from '../../../../../hooks/useNetworkRestriction';
import { NetworkRestrictedHint } from '../../../../../components/networkRestriction/NetworkRestrictedHint';
import { SwitchProjectDialog } from './SwitchProjectDialog';
import { ProjectListStatus } from './ProjectListStatus';
import en from './switchProject/en.json';
import de from './switchProject/de.json';

interface SessionProjectSectionProps {
  resourceId: number;
  /** The viewer's own running session. */
  usage: ResourceUsage;
}

/** The project of the viewer's running session, with the way to move the session to another one. */
export function SessionProjectSection({ resourceId, usage }: Readonly<SessionProjectSectionProps>) {
  const { t } = useTranslations({ en, de });
  const { isRestricted } = useNetworkRestriction();
  // Switching books further usage, so it follows the rule for starting a session.
  const restricted = isRestricted(NetworkRestrictedAction.UsageStart);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: projects } = useFindManyProjects({ query: {} });

  // Somebody without any project, in a session without one, has nothing to switch between.
  if (!usage.project && projects && !projects.data.length) return null;

  return (
    <div className="border-t border-divider pt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-default-500">{t('project')}</p>
          <p className="font-medium text-foreground truncate" data-cy="active-session-project">
            {usage.project?.name ?? t('noProject')}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          // Without a project and without the list there is nothing to pick from.
          isDisabled={restricted || (!usage.project && !projects)}
          onPress={() => setIsDialogOpen(true)}
          data-cy="active-session-switch-project"
        >
          <ArrowRightLeft className="w-4 h-4" />
          {t('change')}
        </Button>
      </div>
      {/* The dialog shows the state of the list itself. */}
      {!isDialogOpen && !projects && <ProjectListStatus />}
      {restricted && <NetworkRestrictedHint actions={NetworkRestrictedAction.UsageStart} />}
      {isDialogOpen && (
        <SwitchProjectDialog resourceId={resourceId} usage={usage} onClose={() => setIsDialogOpen(false)} />
      )}
    </div>
  );
}
