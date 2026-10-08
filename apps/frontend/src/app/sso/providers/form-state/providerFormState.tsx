import React, { useCallback, useState } from 'react';
import {
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
import {
  ensureOidcConfiguration,
  ensureSamlConfiguration,
  buildRoleMappingEntries,
  getDefaultOidcConfiguration,
  getDefaultSamlConfiguration,
  defaultProviderValues,
  RoleMappingEntry,
  buildRoleMappingsPayload,
} from '../formDefaults';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { OpenIDConfiguration } from '../discovery/OpenIDC.data';
import { hasRequiredSamlSigningMaterial } from '../signingMaterial';
import en from '../en.json';
import de from '../de.json';
import type { CreateOIDCConfigurationDto, SSOProvider } from '@attraccess/react-query-client';

/**
 * Where the provider list lives — the Single sign-on settings section, and the target for cancel,
 * post-save and post-delete. The per-provider form hangs off `${SSO_PROVIDERS_LIST_PATH}/providers`.
 */
export const SSO_PROVIDERS_LIST_PATH = '/settings/sso';

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

export function useSSOProviderFormEffects(model: ReturnType<typeof useSSOProviderFormInputs>) {
  const {
    providerDetails,
    setScopesInput,
    setUsernameClaimPathsInput,
    setEmailClaimPathsInput,
    setOidcRoleMappingEntries,
    setEmailAttributeKeysInput,
    setSamlRoleMappingEntries,
    setFormValues,
  } = model;
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
          (extendedProvider.oidcConfiguration.roleMappings ?? undefined) as Record<string, string[]> | undefined,
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
          (extendedProvider.samlConfiguration.roleMappings ?? undefined) as Record<string, string[]> | undefined,
        ),
      );
    } else {
      setEmailAttributeKeysInput('');
      setSamlRoleMappingEntries([]);
    }

    setFormValues(updatedFormValues);
  }, [
    providerDetails,
    setFormValues,
    setScopesInput,
    setUsernameClaimPathsInput,
    setEmailClaimPathsInput,
    setOidcRoleMappingEntries,
    setEmailAttributeKeysInput,
    setSamlRoleMappingEntries,
  ]);

  const setOidc = useCallback(
    (field: keyof NonNullable<CreateSSOProviderDto['oidcConfiguration']>, value: string) => {
      setFormValues((prev) => ({
        ...prev,
        oidcConfiguration: { ...ensureOidcConfiguration(prev.oidcConfiguration), [field]: value },
      }));
    },
    [setFormValues],
  );

  const setSaml = useCallback(
    (field: keyof NonNullable<CreateSSOProviderDto['samlConfiguration']>, value: string) => {
      setFormValues((prev) => ({
        ...prev,
        samlConfiguration: { ...ensureSamlConfiguration(prev.samlConfiguration), [field]: value },
      }));
    },
    [setFormValues],
  );
  return { ...model, setOidc, setSaml } as const;
}

export function useSSOProviderFormCopyValue(model: ReturnType<typeof useSSOProviderFormEffects>) {
  const { showError, t, success, setFormValues, navigate } = model;
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
    [setFormValues],
  );

  const handleSelectChange = useCallback(
    (value: SSOProviderType) => {
      setFormValues((prev) => ({
        ...prev,
        type: value,
        oidcConfiguration:
          value === SSOProviderType.OIDC ? ensureOidcConfiguration(prev.oidcConfiguration) : prev.oidcConfiguration,
        samlConfiguration:
          value === SSOProviderType.SAML ? ensureSamlConfiguration(prev.samlConfiguration) : prev.samlConfiguration,
      }));
    },
    [setFormValues],
  );

  const handleCancel = useCallback(() => {
    navigate(SSO_PROVIDERS_LIST_PATH);
  }, [navigate]);
  return { ...model, copyValue, handleSamlToggleChange, handleSelectChange, handleCancel } as const;
}

const parseList = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const sanitizeOptional = (value?: string) => (value && value.trim().length > 0 ? value.trim() : undefined);

const hasStoredMappings = (config?: { roleMappings?: Record<string, unknown> | null }) =>
  Object.keys(config?.roleMappings ?? {}).length > 0;

export function buildOidcPayload({
  formValues,
  scopesInput,
  usernameClaimPathsInput,
  emailClaimPathsInput,
  oidcRoleMappingEntries,
  isEditing,
  providerDetails,
}: {
  formValues: CreateSSOProviderDto;
  scopesInput: string;
  usernameClaimPathsInput: string;
  emailClaimPathsInput: string;
  oidcRoleMappingEntries: RoleMappingEntry[];
  isEditing: boolean;
  providerDetails: SSOProvider | undefined;
}) {
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
  if (roleMappings) {
    payload.roleMappings = roleMappings;
  } else if (isEditing && hasStoredMappings(providerDetails?.oidcConfiguration)) {
    // emptied table must clear stored mappings; only sent when the provider had
    // some, so plain edits by users without users.roles.manage keep working
    payload.roleMappings = {};
  }

  return payload;
}

export function buildSamlPayload({
  formValues,
  emailAttributeKeysInput,
  samlRoleMappingEntries,
  isEditing,
  providerDetails,
}: {
  formValues: CreateSSOProviderDto;
  emailAttributeKeysInput: string;
  samlRoleMappingEntries: RoleMappingEntry[];
  isEditing: boolean;
  providerDetails: SSOProvider | undefined;
}) {
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
  } else if (isEditing && hasStoredMappings(providerDetails?.samlConfiguration)) {
    // emptied table must clear stored mappings; only sent when the provider had
    // some, so plain edits by users without users.roles.manage keep working
    payload.roleMappings = {};
  } else {
    delete payload.roleMappings;
  }
  return payload;
}

export function useSSOProviderFormHandleSubmit(model: ReturnType<typeof useSSOProviderFormCopyValue>) {
  const {
    samlSigningMaterialsReady,
    showError,
    t,
    isEditing,
    providerId,
    formValues,
    scopesInput,
    usernameClaimPathsInput,
    emailClaimPathsInput,
    oidcRoleMappingEntries,
    providerDetails,
    emailAttributeKeysInput,
    samlRoleMappingEntries,
    updateSSOProvider,
    success,
    createSSOProvider,
    navigate,
  } = model;
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
        const requestBody: UpdateSSOProviderDto = {
          name: formValues.name,
        };

        if (formValues.type === SSOProviderType.OIDC) {
          requestBody.oidcConfiguration = buildOidcPayload({
            formValues: formValues,
            scopesInput: scopesInput,
            usernameClaimPathsInput: usernameClaimPathsInput,
            emailClaimPathsInput: emailClaimPathsInput,
            oidcRoleMappingEntries: oidcRoleMappingEntries,
            isEditing: isEditing,
            providerDetails: providerDetails,
          });
        }

        if (formValues.type === SSOProviderType.SAML) {
          requestBody.samlConfiguration = buildSamlPayload({
            formValues: formValues,
            emailAttributeKeysInput: emailAttributeKeysInput,
            samlRoleMappingEntries: samlRoleMappingEntries,
            isEditing: isEditing,
            providerDetails: providerDetails,
          });
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
          requestBody.oidcConfiguration = buildOidcPayload({
            formValues: formValues,
            scopesInput: scopesInput,
            usernameClaimPathsInput: usernameClaimPathsInput,
            emailClaimPathsInput: emailClaimPathsInput,
            oidcRoleMappingEntries: oidcRoleMappingEntries,
            isEditing: isEditing,
            providerDetails: providerDetails,
          });
        }

        if (formValues.type === SSOProviderType.SAML) {
          requestBody.samlConfiguration = buildSamlPayload({
            formValues: formValues,
            emailAttributeKeysInput: emailAttributeKeysInput,
            samlRoleMappingEntries: samlRoleMappingEntries,
            isEditing: isEditing,
            providerDetails: providerDetails,
          });
        }

        await createSSOProvider.mutateAsync({ requestBody });
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
    providerDetails,
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
  return { ...model, handleSubmit } as const;
}
