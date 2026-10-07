import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from '../en.json';
import de from '../de.json';
import type { SAMLConfigFormProps } from './SAMLConfigForm';

export function useSAMLConfigFormState({ form }: SAMLConfigFormProps) {
  const { t } = useTranslations({ en, de });
  const {
    formValues,
    setSaml,
    emailAttributeKeysInput,
    setEmailAttributeKeysInput,
    showSamlProvisioningSecret,
    setShowSamlProvisioningSecret,
    samlRoleMappingEntries,
    setSamlRoleMappingEntries,
    handleSamlToggleChange,
    providerDetails,
    roles,
    isLoadingRoles,
  } = form;
  return {
    t,
    formValues,
    setSaml,
    emailAttributeKeysInput,
    setEmailAttributeKeysInput,
    showSamlProvisioningSecret,
    setShowSamlProvisioningSecret,
    samlRoleMappingEntries,
    setSamlRoleMappingEntries,
    handleSamlToggleChange,
    providerDetails,
    roles,
    isLoadingRoles,
  } as const;
}
