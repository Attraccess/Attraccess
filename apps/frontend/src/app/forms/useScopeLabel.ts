import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormScope } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

/** Labels where a form applies: "Resource: Laser", "Group: Lasers" or "Global". */
export function useScopeLabel() {
  const { t } = useTranslations({ en, de });
  return (scope: FormScope, resourceName?: string | null, groupName?: string | null) => {
    if (scope === FormScope.RESOURCE && resourceName) return t('scope.resourceWithName', { name: resourceName });
    if (scope === FormScope.GROUP && groupName) return t('scope.groupWithName', { name: groupName });
    return t(`scope.${scope}`);
  };
}
