import React, { useCallback, useState } from 'react';
import { useOverlayState } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CreateOIDCConfigurationDto,
  CreateSSOProviderDto,
  SSOProvider,
  SSOProviderType,
  UpdateSSOProviderDto,
  useAuthenticationServiceCreateOneSsoProvider,
  useAuthenticationServiceDeleteOneSsoProvider,
  useAuthenticationServiceGetOneSsoProviderById,
  useAuthenticationServiceUpdateOneSsoProvider,
  useAuthenticationServiceGetAllSsoProvidersKey,
  useAuthenticationServiceGetOneSsoProviderByIdKey,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { OpenIDConfiguration } from './discovery/OpenIDC.data';
import { hasRequiredSamlSigningMaterial } from './signingMaterial';
import {
  PermissionKey,
  buildPermissionMappingInputs,
  defaultProviderValues,
  emptyPermissionMappingsInput,
  ensureOidcConfiguration,
  ensureSamlConfiguration,
  getDefaultOidcConfiguration,
  getDefaultSamlConfiguration,
  permissionKeys,
} from './formDefaults';
import en from './en.json';
import de from './de.json';

export const useSSOProviderForm = () => {
  const { t } = useTranslations({ en, de });
  const { isOpen, open, close: closeProviderModal, setOpen } = useOverlayState();
  const [editingProvider, setEditingProvider] = useState<SSOProvider | null>(null);
  const [formValues, setFormValues] = useState<CreateSSOProviderDto>(defaultProviderValues);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showSamlProvisioningSecret, setShowSamlProvisioningSecret] = useState(false);
  const [scopesInput, setScopesInput] = useState('');
  const [usernameClaimPathsInput, setUsernameClaimPathsInput] = useState('');
  const [emailClaimPathsInput, setEmailClaimPathsInput] = useState('');
  const [emailAttributeKeysInput, setEmailAttributeKeysInput] = useState('');
  const [oidcPermissionMappingsInput, setOidcPermissionMappingsInput] =
    useState<Record<PermissionKey, string>>(emptyPermissionMappingsInput);
  const [samlPermissionMappingsInput, setSamlPermissionMappingsInput] =
    useState<Record<PermissionKey, string>>(emptyPermissionMappingsInput);
  const queryClient = useQueryClient();

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
  const deleteSSOProvider = useAuthenticationServiceDeleteOneSsoProvider({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useAuthenticationServiceGetAllSsoProvidersKey],
      });
    },
  });
  const { data: providerDetails } = useAuthenticationServiceGetOneSsoProviderById(
    { id: editingProvider?.id as number },
    undefined,
    {
      enabled: !!editingProvider,
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

  // Set form values when provider details are loaded
  React.useEffect(() => {
    if (providerDetails && editingProvider) {
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
        setOidcPermissionMappingsInput(
          buildPermissionMappingInputs(
            (extendedProvider.oidcConfiguration.permissionMappings ?? undefined) as
              | Partial<Record<PermissionKey, string[]>>
              | undefined,
          ),
        );
      } else {
        setScopesInput('');
        setUsernameClaimPathsInput('');
        setEmailClaimPathsInput('');
        setOidcPermissionMappingsInput(emptyPermissionMappingsInput);
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
        setSamlPermissionMappingsInput(
          buildPermissionMappingInputs(
            (extendedProvider.samlConfiguration.permissionMappings ?? undefined) as
              | Partial<Record<PermissionKey, string[]>>
              | undefined,
          ),
        );
      } else {
        setEmailAttributeKeysInput('');
        setSamlPermissionMappingsInput(emptyPermissionMappingsInput);
      }

      setFormValues(updatedFormValues);
    }
  }, [providerDetails, editingProvider]);

  const handleAddNew = useCallback(() => {
    setEditingProvider(null);
    setFormValues(defaultProviderValues);
    setScopesInput('');
    setUsernameClaimPathsInput('');
    setEmailClaimPathsInput('');
    setEmailAttributeKeysInput('');
    setOidcPermissionMappingsInput(emptyPermissionMappingsInput);
    setSamlPermissionMappingsInput(emptyPermissionMappingsInput);
    setShowSamlProvisioningSecret(false);
    open();
  }, [open]);

  const handleEdit = useCallback(
    (provider: SSOProvider) => {
      setEditingProvider(provider);
      open();
    },
    [open],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (window.confirm(t('deleteConfirmation'))) {
        try {
          await deleteSSOProvider.mutateAsync({ id: id as number });
          success({
            title: t('providerDeleted'),
            description: t('providerDeletedDesc'),
          });
        } catch (err) {
          showError({
            title: t('errorGeneric'),
            description: err instanceof Error ? err.message : t('failedToDelete'),
          });
        }
      }
    },
    [deleteSSOProvider, showError, success, t],
  );

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

  const handleSubmit = useCallback(async () => {
    try {
      const parseList = (value: string) =>
        value
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

      const sanitizeOptional = (value?: string) => (value && value.trim().length > 0 ? value.trim() : undefined);

      const buildPermissionMappings = (inputs: Record<PermissionKey, string>) => {
        const mappings: Partial<Record<PermissionKey, string[]>> = {};
        permissionKeys.forEach((key) => {
          const parsed = parseList(inputs[key] ?? '');
          if (parsed.length > 0) {
            mappings[key] = parsed;
          }
        });
        return Object.keys(mappings).length > 0 ? mappings : undefined;
      };

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
        const permissionMappings = buildPermissionMappings(oidcPermissionMappingsInput);
        if (permissionMappings) payload.permissionMappings = permissionMappings;

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

        const permissionMappings = buildPermissionMappings(samlPermissionMappingsInput);
        if (permissionMappings) {
          payload.permissionMappings = permissionMappings;
        } else {
          delete payload.permissionMappings;
        }
        return payload;
      };

      if (editingProvider) {
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
          id: editingProvider.id,
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
      closeProviderModal();
    } catch (err) {
      const errorDescription = editingProvider ? t('failedToUpdate') : t('failedToCreate');
      showError({
        title: t('errorGeneric'),
        description: err instanceof Error ? err.message : errorDescription,
      });
    }
  }, [
    closeProviderModal,
    createSSOProvider,
    editingProvider,
    emailAttributeKeysInput,
    emailClaimPathsInput,
    formValues,
    oidcPermissionMappingsInput,
    samlPermissionMappingsInput,
    samlSigningMaterialsReady,
    scopesInput,
    showError,
    success,
    t,
    updateSSOProvider,
    usernameClaimPathsInput,
  ]);

  return {
    // overlay
    isOpen,
    setOpen,
    // data
    editingProvider,
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
    oidcPermissionMappingsInput,
    setOidcPermissionMappingsInput,
    samlPermissionMappingsInput,
    setSamlPermissionMappingsInput,
    // derived
    isSamlProvider,
    isMutationPending,
    isSaveDisabled,
    // handlers
    onAutoDiscovery,
    handleAddNew,
    handleEdit,
    handleDelete,
    setOidc,
    setSaml,
    copyValue,
    handleSamlToggleChange,
    handleSelectChange,
    handleSubmit,
  };
};

export type SSOProviderFormApi = ReturnType<typeof useSSOProviderForm>;
