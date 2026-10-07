import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from '../en.json';
import de from '../de.json';
import type { OIDCConfigFormProps } from './OIDCConfigForm';

export function useOIDCConfigFormState({ form }: OIDCConfigFormProps) {
  const { t } = useTranslations({ en, de });
  const {
    formValues,
    setOidc,
    scopesInput,
    setScopesInput,
    usernameClaimPathsInput,
    setUsernameClaimPathsInput,
    emailClaimPathsInput,
    setEmailClaimPathsInput,
    showClientSecret,
    setShowClientSecret,
    onAutoDiscovery,
    oidcRoleMappingEntries,
    setOidcRoleMappingEntries,
    roles,
    isLoadingRoles,
  } = form;
  return {
    t,
    formValues,
    setOidc,
    scopesInput,
    setScopesInput,
    usernameClaimPathsInput,
    setUsernameClaimPathsInput,
    emailClaimPathsInput,
    setEmailClaimPathsInput,
    showClientSecret,
    setShowClientSecret,
    onAutoDiscovery,
    oidcRoleMappingEntries,
    setOidcRoleMappingEntries,
    roles,
    isLoadingRoles,
  } as const;
}
