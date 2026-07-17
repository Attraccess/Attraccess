import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CreateOIDCConfigurationDto,
  CreateSSOProviderDto,
  SSOProviderType,
  UpdateSSOProviderDto,
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
import {
  buildRoleMappingEntries,
  buildRoleMappingsPayload,
  defaultProviderValues,
  ensureOidcConfiguration,
  ensureSamlConfiguration,
  getDefaultOidcConfiguration,
  getDefaultSamlConfiguration,
  RoleMappingEntry,
} from './formDefaults';
import en from './en.json';
import de from './de.json';

export const SSO_PROVIDERS_PATH = '/sso/providers';

export const useSSOProviderForm = (providerId?: number) => {
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

  // Populate form values when editing and the provider details are loaded
  React.useEffect(() => {
    if (!providerDetails) {
      return;
    }

    const extendedProvider = providerDetails;
    const updatedFormValues: CreateSSOProviderDto = {
      name: extendedProvider.name,
      type: extendedProvider.type as SSOProviderType,
      oidcConfiguration: getDefaultOidcConfiguration(),
      samlConfiguration: getDefaultSamlConfiguration(),
    };

    if (extendedProvider.type === SSOProviderType.OIDC && extendedProvider.oidcConfiguration) {
      updatedFormValues.oidcConfiguration = {
        issuer: extendedProvider.oidcConfiguration.issuer ?? '',
        authorizationURL: extendedProvider.oidcConfiguration.authorizationURL ?? '',
        tokenURL: extendedProvider.oidcConfiguration.tokenURL ?? '',
        userInfoURL: extendedProvider.oidcConfiguration.userInfoURL ?? '',
        clientId: extendedProvider.oidcConfiguration.clientId ?? '',
        clientSecret: extendedProvider.oidcConfiguration.clientSecret ?? '',
      };

      setScopesInput(
        Array.isArray(extendedProvider.oidcConfiguration.scopes)
          ? extendedProvider.oidcConfiguration.scopes.join(', ')
          : '',
      );
      setUsernameClaimPathsInput(
        Array.isArray(extendedProvider.oidcConfiguration.usernameClaimPaths)
          ? extendedProvider.oidcConfiguration.usernameClaimPaths.join(', ')
          : '',
      );
      setEmailClaimPathsInput(
        Array.isArray(extendedProvider.oidcConfiguration.emailClaimPaths)
          ? extendedProvider.oidcConfiguration.emailClaimPaths.join(', ')
          : '',
      );
      setOidcRoleMappingEntries(
        buildRoleMappingEntries(
          (extendedProvider.oidcConfiguration.roleMappings ??
            extendedProvider.oidcConfiguration.permissionMappings ??
            undefined) as Record<string, string[]> | undefined,
        ),
      );
    } else {
      setScopesInput('');
      setUsernameClaimPathsInput('');
      setEmailClaimPathsInput('');
      setOidcRoleMappingEntries([]);
    }

    if (extendedProvider.type === SSOProviderType.SAML && extendedProvider.samlConfiguration) {
      updatedFormValues.samlConfiguration = {
        entryPoint: extendedProvider.samlConfiguration.entryPoint ?? '',
        issuer: extendedProvider.samlConfiguration.issuer ?? '',
        certificate: extendedProvider.samlConfiguration.certificate ?? '',
        audience: extendedProvider.samlConfiguration.audience ?? '',
        signRequest: extendedProvider.samlConfiguration.signRequest ?? false,
        wantAssertionsSigned: extendedProvider.samlConfiguration.wantAssertionsSigned ?? false,
        wantAuthnResponseSigned: extendedProvider.samlConfiguration.wantAuthnResponseSigned ?? true,
        forceAuthn: extendedProvider.samlConfiguration.forceAuthn ?? false,
        provisioningSecret: '',
        spSigningCertificate: extendedProvider.samlConfiguration.spSigningCertificate ?? '',
        spSigningPrivateKey: '',
      };
      setEmailAttributeKeysInput(
        Array.isArray(extendedProvider.samlConfiguration.emailAttributeKeys)
          ? extendedProvider.samlConfiguration.emailAttributeKeys.join(', ')
          : '',
      );
      setSamlRoleMappingEntries(
        buildRoleMappingEntries(
          (extendedProvider.samlConfiguration.roleMappings ??
            extendedProvider.samlConfiguration.permissionMappings ??
            undefined) as Record<string, string[]> | undefined,
        ),
      );
    } else {
      setEmailAttributeKeysInput('');
      setSamlRoleMappingEntries([]);
    }

    setFormValues(updatedFormValues);
  }, [providerDetails]);

  const setOidc = useCallback((field: keyof NonNullable<CreateSSOProviderDto['oidcConfiguration']>, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      oidcConfiguration: { ...ensureOidcConfiguration(prev.oidcConfiguration), [field]: value },
    }));
  }, []);

  const setSaml = useCallback((field: keyof NonNullable<CreateSSOProviderDto['samlConfiguration']>, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      samlConfiguration: { ...ensureSamlConfiguration(prev.samlConfiguration), [field]: value },
    }));
  }, []);

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
    (field: keyof NonNullable<CreateSSOProviderDto['samlConfiguration']>, nextValue: boolean) => {
      setFormValues((prev) => ({
        ...prev,
        samlConfiguration: {
          ...ensureSamlConfiguration(prev.samlConfiguration),
          [field]: nextValue,
        },
      }));
    },
    [],
  );

  const handleSelectChange = useCallback((value: SSOProviderType) => {
    setFormValues((prev) => ({
      ...prev,
      type: value,
      oidcConfiguration:
        value === SSOProviderType.OIDC ? ensureOidcConfiguration(prev.oidcConfiguration) : prev.oidcConfiguration,
      samlConfiguration:
        value === SSOProviderType.SAML ? ensureSamlConfiguration(prev.samlConfiguration) : prev.samlConfiguration,
    }));
  }, []);

  const handleCancel = useCallback(() => {
    navigate(SSO_PROVIDERS_PATH);
  }, [navigate]);

  const handleSubmit = useCallback(async () => {
    try {
      const parseList = (value: string) =>
        value
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

      const sanitizeOptional = (value?: string) => (value && value.trim().length > 0 ? value.trim() : undefined);

      if (!samlSigningMaterialsReady) {
        showError({
          title: t('errorGeneric'),
          description: t('signingMaterialsMissing'),
        });
        return;
      }

      const buildOidcPayload = () => {
        const base = ensureOidcConfiguration(formValues.oidcConfiguration);
        const payload: CreateOIDCConfigurationDto = {
          issuer: base.issuer,
          authorizationURL: base.authorizationURL,
          tokenURL: base.tokenURL,
          userInfoURL: base.userInfoURL,
          clientId: base.clientId,
          clientSecret: base.clientSecret,
        };

        if (scopesInput.trim().length > 0) payload.scopes = parseList(scopesInput);
        if (usernameClaimPathsInput.trim().length > 0) payload.usernameClaimPaths = parseList(usernameClaimPathsInput);
        if (emailClaimPathsInput.trim().length > 0) payload.emailClaimPaths = parseList(emailClaimPathsInput);
        const roleMappings = buildRoleMappingsPayload(oidcRoleMappingEntries);
        if (roleMappings) payload.roleMappings = roleMappings;

        return payload;
      };

      const buildSamlPayload = () => {
        const base = ensureSamlConfiguration(formValues.samlConfiguration);
        const payload: NonNullable<CreateSSOProviderDto['samlConfiguration']> = {
          ...base,
          audience: sanitizeOptional(base.audience),
        };
        const parsedEmailKeys = parseList(emailAttributeKeysInput);
        if (parsedEmailKeys.length > 0) {
          payload.emailAttributeKeys = parsedEmailKeys;
        } else {
          delete payload.emailAttributeKeys;
        }

        const sanitizedSigningCertificate = sanitizeOptional(base.spSigningCertificate);
        if (sanitizedSigningCertificate) {
          payload.spSigningCertificate = sanitizedSigningCertificate;
        } else {
          delete payload.spSigningCertificate;
        }

        if (base.spSigningPrivateKey && base.spSigningPrivateKey.trim().length > 0) {
          payload.spSigningPrivateKey = base.spSigningPrivateKey.trim();
        } else {
          delete payload.spSigningPrivateKey;
        }

        if (base.provisioningSecret && base.provisioningSecret.trim().length > 0) {
          payload.provisioningSecret = base.provisioningSecret.trim();
        } else {
          delete payload.provisioningSecret;
        }

        const roleMappings = buildRoleMappingsPayload(samlRoleMappingEntries);
        if (roleMappings) {
          payload.roleMappings = roleMappings;
        } else {
          delete payload.roleMappings;
        }
        return payload;
      };

      if (isEditing && providerId !== undefined) {
        const requestBody: UpdateSSOProviderDto = {
          name: formValues.name,
        };

        if (formValues.type === SSOProviderType.OIDC) {
          requestBody.oidcConfiguration = buildOidcPayload();
        }

        if (formValues.type === SSOProviderType.SAML) {
          requestBody.samlConfiguration = buildSamlPayload();
        }

        await updateSSOProvider.mutateAsync({
          id: providerId,
          requestBody: requestBody,
        });
        success({
          title: t('providerUpdated'),
          description: t('providerUpdatedDesc'),
        });
      } else {
        const requestBody: CreateSSOProviderDto = {
          name: formValues.name,
          type: formValues.type,
        };

        if (formValues.type === SSOProviderType.OIDC) {
          requestBody.oidcConfiguration = buildOidcPayload();
        }

        if (formValues.type === SSOProviderType.SAML) {
          requestBody.samlConfiguration = buildSamlPayload();
        }

        await createSSOProvider.mutateAsync({ requestBody });
        success({
          title: t('providerCreated'),
          description: t('providerCreatedDesc'),
        });
      }
      navigate(SSO_PROVIDERS_PATH);
    } catch (err) {
      const errorDescription = isEditing ? t('failedToUpdate') : t('failedToCreate');
      showError({
        title: t('errorGeneric'),
        description: err instanceof Error ? err.message : errorDescription,
      });
    }
  }, [
    createSSOProvider,
    emailAttributeKeysInput,
    emailClaimPathsInput,
    formValues,
    isEditing,
    navigate,
    oidcRoleMappingEntries,
    providerId,
    samlRoleMappingEntries,
    samlSigningMaterialsReady,
    scopesInput,
    showError,
    success,
    t,
    updateSSOProvider,
    usernameClaimPathsInput,
  ]);

  return {
    // mode
    isEditing,
    isLoadingProvider,
    // data
    providerDetails,
    // form state
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
    roles,
    isLoadingRoles,
    oidcRoleMappingEntries,
    setOidcRoleMappingEntries,
    samlRoleMappingEntries,
    setSamlRoleMappingEntries,
    // derived
    isSamlProvider,
    isMutationPending,
    isSaveDisabled,
    // handlers
    onAutoDiscovery,
    setOidc,
    setSaml,
    copyValue,
    handleSamlToggleChange,
    handleSelectChange,
    handleCancel,
    handleSubmit,
  };
};

export type SSOProviderFormApi = ReturnType<typeof useSSOProviderForm>;
