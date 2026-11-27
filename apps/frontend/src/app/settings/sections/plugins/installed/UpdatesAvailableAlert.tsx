import { Button } from '@attraccess/plugins-frontend-ui';
import { usePluginControllerUpdatePolicy } from '@attraccess/react-query-client';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import type { VersionPlugin } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { useInstalledNpmPlugins } from './useInstalledNpmPlugins';

interface Props {
  onReview: (plugin: VersionPlugin) => void;
}

/** Names the available updates, and whether the host will install any of them on its own. */
export function UpdatesAvailableAlert({ onReview }: Props) {
  const { t } = usePluginsTranslations();
  const { installed } = useInstalledNpmPlugins();
  const { data: policy } = usePluginControllerUpdatePolicy();
  const available = installed.filter((plugin) => plugin.updateCheck?.state === 'available');
  if (available.length === 0) return null;
  const installsOnItsOwn = policy?.automaticUpdates && policy.checksEnabled;
  return (
    <Alert status="warning" data-cy="plugins-list-updates-available">
      <AlertContent>
        <AlertTitle>{t('updatePolicy.availableTitle')}</AlertTitle>
        <AlertDescription>
          {t('updatePolicy.availableDescription', { count: available.length })}
          {/* Says nothing about installing until the policy is known. */}
          {policy ? ` ${t(installsOnItsOwn ? 'updatePolicy.installsInWindow' : 'updatePolicy.manualOnly')}` : null}
        </AlertDescription>
        <Button className="mt-2" variant="secondary" size="sm" onPress={() => onReview(available[0])}>
          {t('updatePolicy.reviewUpdates')}
        </Button>
      </AlertContent>
    </Alert>
  );
}
