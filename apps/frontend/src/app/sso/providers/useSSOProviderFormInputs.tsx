import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CreateSSOProviderDto,
  SSOProviderType,
  useAuthenticationServiceCreateOneSsoProvider,
  useAuthenticationServiceGetOneSsoProviderById,
  useAuthenticationServiceUpdateOneSsoProvider,
  useAuthenticationServiceGetAllSsoProvidersKey,
  useAuthenticationServiceGetOneSsoProviderByIdKey,
  useRbacServiceListRoles,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { OpenIDConfiguration } from './discovery/OpenIDC.data';
import { hasRequiredSamlSigningMaterial } from './signingMaterial';
import { defaultProviderValues, RoleMappingEntry } from './formDefaults';
import en from './en.json';
import de from './de.json';

export function useSSOProviderFormInputs(providerId?: number) {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const isEditing = providerId !== undefined;
  const [formValues, setFormValues] = useState<CreateSSOProviderDto>(defaultProviderValues);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showSamlProvisioningSecret, setShowSamlProvisioningSecret] = useState(false);
  const [scopesInput, setScopesInput] = useState('');
  const [usernameClaimPathsInput, setUsernameClaimPathsInput] = useState('');
  const [emailClaimPathsInput, setEmailClaimPathsInput] = useState('');
  const [emailAttributeKeysInput, setEmailAttributeKeysInput] = useState('');
  const [oidcRoleMappingEntries, setOidcRoleMappingEntries] = useState<RoleMappingEntry[]>([]);
  const [samlRoleMappingEntries, setSamlRoleMappingEntries] = useState<RoleMappingEntry[]>([]);
  const queryClient = useQueryClient();
  const { data: roles, isLoading: isLoadingRoles } = useRbacServiceListRoles();

  const { success, error: showError } = useToastMessage();
  const createSSOProvider = useAuthenticationServiceCreateOneSsoProvider({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useAuthenticationServiceGetAllSsoProvidersKey],
      });
    },
  });
  const updateSSOProvider = useAuthenticationServiceUpdateOneSsoProvider({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useAuthenticationServiceGetAllSsoProvidersKey],
      });
      queryClient.invalidateQueries({
        queryKey: [useAuthenticationServiceGetOneSsoProviderByIdKey],
      });
    },
  });
  const { data: providerDetails, isLoading: isLoadingProvider } = useAuthenticationServiceGetOneSsoProviderById(
    { id: providerId as number },
    undefined,
    {
      enabled: isEditing,
    },
  );

  const isSamlProvider = formValues.type === SSOProviderType.SAML;
  const isSamlSigningEnabled = isSamlProvider && (formValues.samlConfiguration?.signRequest ?? false);
  const isMutationPending = createSSOProvider.isPending || updateSSOProvider.isPending;
  const samlSigningMaterialsReady = hasRequiredSamlSigningMaterial({
    isSigningEnabled: isSamlSigningEnabled,
    storedCertificate: providerDetails?.samlConfiguration?.spSigningCertificate,
    storedKey: providerDetails?.samlConfiguration?.spSigningKeyEncrypted,
    inputCertificate: formValues.samlConfiguration?.spSigningCertificate,
    inputPrivateKey: formValues.samlConfiguration?.spSigningPrivateKey,
  });
  const isSaveDisabled = isMutationPending || !samlSigningMaterialsReady;

  const onAutoDiscovery = useCallback((config: OpenIDConfiguration) => {
    setFormValues((prev) => ({
      ...prev,
      oidcConfiguration: {
        ...prev.oidcConfiguration,
        issuer: config.issuer,
        authorizationURL: config.authorization_endpoint,
        tokenURL: config.token_endpoint,
        userInfoURL: config.userinfo_endpoint,
        // We don't get clientId and clientSecret from the discovery endpoint
        // Preserve existing values if they exist
        clientId: prev.oidcConfiguration?.clientId ?? '',
        clientSecret: prev.oidcConfiguration?.clientSecret ?? '',
      },
    }));
  }, []);
  return {
    t,
    navigate,
    isEditing,
    formValues,
    setFormValues,
    showClientSecret,
    setShowClientSecret,
    showSamlProvisioningSecret,
    setShowSamlProvisioningSecret,
    scopesInput,
    setScopesInput,
    usernameClaimPathsInput,
    setUsernameClaimPathsInput,
    emailClaimPathsInput,
    setEmailClaimPathsInput,
    emailAttributeKeysInput,
    setEmailAttributeKeysInput,
    oidcRoleMappingEntries,
    setOidcRoleMappingEntries,
    samlRoleMappingEntries,
    setSamlRoleMappingEntries,
    queryClient,
    roles,
    isLoadingRoles,
    success,
    showError,
    createSSOProvider,
    updateSSOProvider,
    providerDetails,
    isLoadingProvider,
    isSamlProvider,
    isSamlSigningEnabled,
    isMutationPending,
    samlSigningMaterialsReady,
    isSaveDisabled,
    onAutoDiscovery,
    providerId,
  } as const;
}
