import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import {
  CreateSsoProviderDtoWritable,
  Role,
  SsoProvider,
  SsoProviderType,
  UpdateSsoProviderDtoWritable,
  useCreateOneSsoProvider,
  useGetOneSsoProviderById,
  useUpdateOneSsoProvider,
  useGetAllSsoProvidersKey,
  useGetOneSsoProviderByIdKey,
  useListRoles,
} from '@attraccess/react-query-client';
import {
  ensureOidcConfiguration,
  ensureSamlConfiguration,
  buildRoleMappingEntries,
  getDefaultOidcConfiguration,
  getDefaultSamlConfiguration,
  defaultProviderValues,
  RoleMappingEntry,
} from './formDefaults';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import { getApiErrorMessage } from '../../../utils/apiError';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { OpenIDConfiguration } from './discovery/OpenIDC.data';
import { hasRequiredSamlSigningMaterial } from './signingMaterial';
import en from './en.json';
import de from './de.json';
import { buildOidcPayload, buildSamlPayload } from './form-state/providerFormPayload';
import { listValue, oidcFormValues, samlFormValues } from './form-state/providerFormValues';

/**
 * Where the provider list lives — the Single sign-on settings section, and the target for cancel,
 * post-save and post-delete. The per-provider form hangs off `${SSO_PROVIDERS_LIST_PATH}/providers`.
 */
export const SSO_PROVIDERS_LIST_PATH = '/settings/sso';

type OidcField = keyof NonNullable<CreateSsoProviderDtoWritable['oidcConfiguration']>;
type SamlField = keyof NonNullable<CreateSsoProviderDtoWritable['samlConfiguration']>;
type SetList = Dispatch<SetStateAction<string[]>>;
type SetRoleMappings = Dispatch<SetStateAction<RoleMappingEntry[]>>;

/** The working copy of an SSO provider that the form page and its OIDC/SAML/role sections edit together. */
export interface SSOProviderFormApi {
  isEditing: boolean;
  isLoadingProvider: boolean;
  providerDetails: SsoProvider | undefined;
  formValues: CreateSsoProviderDtoWritable;
  setFormValues: Dispatch<SetStateAction<CreateSsoProviderDtoWritable>>;
  showClientSecret: boolean;
  setShowClientSecret: Dispatch<SetStateAction<boolean>>;
  showSamlProvisioningSecret: boolean;
  setShowSamlProvisioningSecret: Dispatch<SetStateAction<boolean>>;
  scopes: string[];
  setScopes: SetList;
  usernameClaimPaths: string[];
  setUsernameClaimPaths: SetList;
  emailClaimPaths: string[];
  setEmailClaimPaths: SetList;
  emailAttributeKeys: string[];
  setEmailAttributeKeys: SetList;
  roleClaimPaths: string[];
  setRoleClaimPaths: SetList;
  roleAttributeKeys: string[];
  setRoleAttributeKeys: SetList;
  roles: Role[] | undefined;
  isLoadingRoles: boolean;
  oidcRoleMappingEntries: RoleMappingEntry[];
  setOidcRoleMappingEntries: SetRoleMappings;
  samlRoleMappingEntries: RoleMappingEntry[];
  setSamlRoleMappingEntries: SetRoleMappings;
  isSamlProvider: boolean;
  isMutationPending: boolean;
  isSaveDisabled: boolean;
  onAutoDiscovery: (config: OpenIDConfiguration) => void;
  setOidc: (field: OidcField, value: string | string[] | number | null) => void;
  setSaml: (field: SamlField, value: string) => void;
  copyValue: (value: string) => Promise<void>;
  handleSamlToggleChange: (field: SamlField, nextValue: boolean) => void;
  handleSelectChange: (value: SsoProviderType) => void;
  handleCancel: () => void;
  handleSubmit: () => Promise<void>;
}

export function useSSOProviderForm(providerId?: number): SSOProviderFormApi {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const isEditing = providerId !== undefined;
  const [formValues, setFormValues] = useState<CreateSsoProviderDtoWritable>(defaultProviderValues);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showSamlProvisioningSecret, setShowSamlProvisioningSecret] = useState(false);
  const [scopes, setScopes] = useState<string[]>([]);
  const [usernameClaimPaths, setUsernameClaimPaths] = useState<string[]>([]);
  const [emailClaimPaths, setEmailClaimPaths] = useState<string[]>([]);
  const [emailAttributeKeys, setEmailAttributeKeys] = useState<string[]>([]);
  const [roleClaimPaths, setRoleClaimPaths] = useState<string[]>([]);
  const [roleAttributeKeys, setRoleAttributeKeys] = useState<string[]>([]);
  const [oidcRoleMappingEntries, setOidcRoleMappingEntries] = useState<RoleMappingEntry[]>([]);
  const [samlRoleMappingEntries, setSamlRoleMappingEntries] = useState<RoleMappingEntry[]>([]);
  const queryClient = useQueryClient();
  const { data: roles, isLoading: isLoadingRoles } = useListRoles();

  const { success, error: showError } = useToastMessage();
  const createSSOProvider = useCreateOneSsoProvider(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useGetAllSsoProvidersKey],
      });
    },
  });
  const updateSSOProvider = useUpdateOneSsoProvider(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useGetAllSsoProvidersKey],
      });
      queryClient.invalidateQueries({
        queryKey: [useGetOneSsoProviderByIdKey],
      });
    },
  });
  const { data: providerDetails, isLoading: isLoadingProvider } = useGetOneSsoProviderById(
    { path: { id: providerId as number } },
    undefined,
    {
      enabled: isEditing,
    },
  );

  const isSamlProvider = formValues.type === SsoProviderType.SAML;
  const isSamlSigningEnabled =
    isSamlProvider &&
    (!!formValues.samlConfiguration?.logoutURL || (formValues.samlConfiguration?.signRequest ?? false));
  const isMutationPending = createSSOProvider.isPending || updateSSOProvider.isPending;
  const samlSigningMaterialsReady = hasRequiredSamlSigningMaterial({
    isSigningEnabled: isSamlSigningEnabled,
    storedCertificate: providerDetails?.samlConfiguration?.spSigningCertificate,
    storedKey: providerDetails?.samlConfiguration?.spSigningKeyEncryptionKeyId,
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
        endSessionURL: typeof config.end_session_endpoint === 'string' ? config.end_session_endpoint : '',
        jwksURL: typeof config.jwks_uri === 'string' ? config.jwks_uri : '',
        signingAlgorithms: prev.oidcConfiguration?.signingAlgorithms ?? ['RS256'],
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

  // Populate form values when editing and the provider details are loaded
  useEffect(() => {
    if (!providerDetails) {
      return;
    }

    const extendedProvider = providerDetails;
    const updatedFormValues: CreateSsoProviderDtoWritable = {
      name: extendedProvider.name,
      type: extendedProvider.type as SsoProviderType,
      oidcConfiguration: getDefaultOidcConfiguration(),
      samlConfiguration: getDefaultSamlConfiguration(),
    };

    const oidcConfiguration = extendedProvider.type === SsoProviderType.OIDC && extendedProvider.oidcConfiguration;
    if (oidcConfiguration) {
      updatedFormValues.oidcConfiguration = oidcFormValues(oidcConfiguration);
      setScopes(listValue(oidcConfiguration.scopes));
      setUsernameClaimPaths(listValue(oidcConfiguration.usernameClaimPaths));
      setEmailClaimPaths(listValue(oidcConfiguration.emailClaimPaths));
      setRoleClaimPaths(listValue(oidcConfiguration.roleClaimPaths));
      setOidcRoleMappingEntries(
        buildRoleMappingEntries((oidcConfiguration.roleMappings ?? undefined) as Record<string, string[]> | undefined),
      );
    } else {
      setScopes([]);
      setUsernameClaimPaths([]);
      setEmailClaimPaths([]);
      setRoleClaimPaths([]);
      setOidcRoleMappingEntries([]);
    }

    const samlConfiguration = extendedProvider.type === SsoProviderType.SAML && extendedProvider.samlConfiguration;
    if (samlConfiguration) {
      updatedFormValues.samlConfiguration = samlFormValues(samlConfiguration);
      setEmailAttributeKeys(listValue(samlConfiguration.emailAttributeKeys));
      setRoleAttributeKeys(listValue(samlConfiguration.roleAttributeKeys));
      setSamlRoleMappingEntries(
        buildRoleMappingEntries((samlConfiguration.roleMappings ?? undefined) as Record<string, string[]> | undefined),
      );
    } else {
      setEmailAttributeKeys([]);
      setRoleAttributeKeys([]);
      setSamlRoleMappingEntries([]);
    }

    setFormValues(updatedFormValues);
  }, [
    providerDetails,
    setFormValues,
    setScopes,
    setUsernameClaimPaths,
    setEmailClaimPaths,
    setOidcRoleMappingEntries,
    setEmailAttributeKeys,
    setRoleClaimPaths,
    setRoleAttributeKeys,
    setSamlRoleMappingEntries,
  ]);

  const setOidc = useCallback(
    (
      field: keyof NonNullable<CreateSsoProviderDtoWritable['oidcConfiguration']>,
      value: string | string[] | number | null,
    ) => {
      setFormValues((prev) => ({
        ...prev,
        oidcConfiguration: { ...ensureOidcConfiguration(prev.oidcConfiguration), [field]: value },
      }));
    },
    [setFormValues],
  );

  const setSaml = useCallback(
    (field: keyof NonNullable<CreateSsoProviderDtoWritable['samlConfiguration']>, value: string) => {
      setFormValues((prev) => ({
        ...prev,
        samlConfiguration: { ...ensureSamlConfiguration(prev.samlConfiguration), [field]: value },
      }));
    },
    [setFormValues],
  );

  const copyValue = useCallback(
    async (value: string) => {
      if (!value) {
        return;
      }

      if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
        showError({
          title: t('copyFailedTitle'),
          description: t('copyUnsupported'),
        });
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        success({
          title: t('copySuccessTitle'),
        });
      } catch (err) {
        showError({
          title: t('copyFailedTitle'),
          description: err instanceof Error ? err.message : t('copyFailedDesc'),
        });
      }
    },
    [showError, success, t],
  );

  const handleSamlToggleChange = useCallback(
    (field: keyof NonNullable<CreateSsoProviderDtoWritable['samlConfiguration']>, nextValue: boolean) => {
      setFormValues((prev) => ({
        ...prev,
        samlConfiguration: {
          ...ensureSamlConfiguration(prev.samlConfiguration),
          [field]: nextValue,
        },
      }));
    },
    [setFormValues],
  );

  const handleSelectChange = useCallback(
    (value: SsoProviderType) => {
      setFormValues((prev) => ({
        ...prev,
        type: value,
        oidcConfiguration:
          value === SsoProviderType.OIDC ? ensureOidcConfiguration(prev.oidcConfiguration) : prev.oidcConfiguration,
        samlConfiguration:
          value === SsoProviderType.SAML ? ensureSamlConfiguration(prev.samlConfiguration) : prev.samlConfiguration,
      }));
    },
    [setFormValues],
  );

  const handleCancel = useCallback(() => {
    navigate(SSO_PROVIDERS_LIST_PATH);
  }, [navigate]);

  const handleSubmit = useCallback(async () => {
    try {
      if (!samlSigningMaterialsReady) {
        showError({
          title: t('errorGeneric'),
          description: t('signingMaterialsMissing'),
        });
        return;
      }
      if (isEditing && providerId !== undefined) {
        const requestBody: UpdateSsoProviderDtoWritable = {
          name: formValues.name,
        };

        if (formValues.type === SsoProviderType.OIDC) {
          requestBody.oidcConfiguration = buildOidcPayload({
            formValues: formValues,
            scopes,
            usernameClaimPaths,
            emailClaimPaths,
            roleClaimPaths,
            oidcRoleMappingEntries: oidcRoleMappingEntries,
            isEditing: isEditing,
            providerDetails: providerDetails,
          });
        }

        if (formValues.type === SsoProviderType.SAML) {
          requestBody.samlConfiguration = buildSamlPayload({
            formValues: formValues,
            emailAttributeKeys,
            roleAttributeKeys,
            samlRoleMappingEntries: samlRoleMappingEntries,
            isEditing: isEditing,
            providerDetails: providerDetails,
          });
        }

        await updateSSOProvider.mutateAsync({ path: { id: providerId }, body: requestBody });
        success({
          title: t('providerUpdated'),
          description: t('providerUpdatedDesc'),
        });
      } else {
        const requestBody: CreateSsoProviderDtoWritable = {
          name: formValues.name,
          type: formValues.type,
        };

        if (formValues.type === SsoProviderType.OIDC) {
          requestBody.oidcConfiguration = buildOidcPayload({
            formValues: formValues,
            scopes,
            usernameClaimPaths,
            emailClaimPaths,
            roleClaimPaths,
            oidcRoleMappingEntries: oidcRoleMappingEntries,
            isEditing: isEditing,
            providerDetails: providerDetails,
          });
        }

        if (formValues.type === SsoProviderType.SAML) {
          requestBody.samlConfiguration = buildSamlPayload({
            formValues: formValues,
            emailAttributeKeys,
            roleAttributeKeys,
            samlRoleMappingEntries: samlRoleMappingEntries,
            isEditing: isEditing,
            providerDetails: providerDetails,
          });
        }

        await createSSOProvider.mutateAsync({ body: requestBody });
        success({
          title: t('providerCreated'),
          description: t('providerCreatedDesc'),
        });
      }
      navigate(SSO_PROVIDERS_LIST_PATH);
    } catch (err) {
      const errorDescription = isEditing ? t('failedToUpdate') : t('failedToCreate');
      showError({
        title: t('errorGeneric'),
        description: err instanceof Error ? getApiErrorMessage(err) : errorDescription,
      });
    }
  }, [
    createSSOProvider,
    emailAttributeKeys,
    emailClaimPaths,
    roleClaimPaths,
    roleAttributeKeys,
    formValues,
    isEditing,
    navigate,
    oidcRoleMappingEntries,
    providerDetails,
    providerId,
    samlRoleMappingEntries,
    samlSigningMaterialsReady,
    scopes,
    showError,
    success,
    t,
    updateSSOProvider,
    usernameClaimPaths,
  ]);
  return {
    isEditing,
    isLoadingProvider,
    providerDetails,
    formValues,
    setFormValues,
    showClientSecret,
    setShowClientSecret,
    showSamlProvisioningSecret,
    setShowSamlProvisioningSecret,
    scopes,
    setScopes,
    usernameClaimPaths,
    setUsernameClaimPaths,
    emailClaimPaths,
    setEmailClaimPaths,
    emailAttributeKeys,
    setEmailAttributeKeys,
    roleClaimPaths,
    setRoleClaimPaths,
    roleAttributeKeys,
    setRoleAttributeKeys,
    roles,
    isLoadingRoles,
    oidcRoleMappingEntries,
    setOidcRoleMappingEntries,
    samlRoleMappingEntries,
    setSamlRoleMappingEntries,
    isSamlProvider,
    isMutationPending,
    isSaveDisabled,
    onAutoDiscovery,
    setOidc,
    setSaml,
    copyValue,
    handleSamlToggleChange,
    handleSelectChange,
    handleCancel,
    handleSubmit,
  };
}
