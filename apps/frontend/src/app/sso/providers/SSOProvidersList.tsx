import React, { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Tooltip, TextField, Label, Input, InputGroup, Description, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading, Divider, Card, CardContent, CardHeader, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Textarea, Switch, Link, useOverlayState } from '@heroui/react';
import { Pencil, Trash, Key, FileCode, Eye, EyeOff, MoreVertical, Copy, Info } from 'lucide-react';
import { useToastMessage } from '../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  CreateOIDCConfigurationDto,
  CreateSSOProviderDto,
  SSOPermissionMappingsDto,
  SSOProvider,
  SSOProviderType,
  UpdateSSOProviderDto,
  useAuthenticationServiceCreateOneSsoProvider,
  useAuthenticationServiceDeleteOneSsoProvider,
  useAuthenticationServiceGetAllSsoProviders,
  useAuthenticationServiceGetOneSsoProviderById,
  useAuthenticationServiceUpdateOneSsoProvider,
  useAuthenticationServiceGetAllSsoProvidersKey,
  useAuthenticationServiceGetOneSsoProviderByIdKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { EmptyState } from '../../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import en from './en.json';
import de from './de.json';
import { AuthentikDiscoveryDialog } from './discovery/authentik';
import { OpenIDConfiguration } from './discovery/OpenIDC.data';
import { KeycloakDiscoveryDialog } from './discovery/keycloak';
import { Select } from '../../../components/select';
import { getBaseUrl } from '../../../api';
import { hasRequiredSamlSigningMaterial } from './signingMaterial';

const permissionKeys = [
  'canManageResources',
  'canManageSystemConfiguration',
  'canManageUsers',
  'canManageBilling',
] as const;

type PermissionKey = (typeof permissionKeys)[number];

const getDefaultOidcConfiguration = () => ({
  issuer: '',
  authorizationURL: '',
  tokenURL: '',
  userInfoURL: '',
  clientId: '',
  clientSecret: '',
});

const getDefaultSamlConfiguration = () => ({
  entryPoint: '',
  issuer: '',
  certificate: '',
  audience: '',
  signRequest: false,
  wantAssertionsSigned: false,
  wantAuthnResponseSigned: true,
  forceAuthn: false,
  provisioningSecret: '',
  spSigningCertificate: '',
  spSigningPrivateKey: '',
});

const emptyPermissionMappingsInput: Record<PermissionKey, string> = {
  canManageResources: '',
  canManageSystemConfiguration: '',
  canManageUsers: '',
  canManageBilling: '',
};

const defaultProviderValues: CreateSSOProviderDto = {
  name: '',
  type: SSOProviderType.OIDC,
  oidcConfiguration: getDefaultOidcConfiguration(),
  samlConfiguration: getDefaultSamlConfiguration(),
};

const ensureOidcConfiguration = (config?: CreateSSOProviderDto['oidcConfiguration']) =>
  config ?? getDefaultOidcConfiguration();

const ensureSamlConfiguration = (config?: CreateSSOProviderDto['samlConfiguration']) =>
  config ?? getDefaultSamlConfiguration();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface SSOProvidersListRef {
  handleAddNew: () => void;
}

export const SSOProvidersList = forwardRef<SSOProvidersListRef, React.ComponentPropsWithoutRef<'div'>>((props, ref) => {
  const { t } = useTranslations({ en, de });
  const { data: providers, status: fetchStatus, error } = useAuthenticationServiceGetAllSsoProviders();
  const { isOpen, open, close, setOpen } = useOverlayState();
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

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

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
  const ssoBaseUrl = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    return getBaseUrl() ?? window.location.origin;
  }, []);
  const docsSsoProvidersUrl = React.useMemo(() => {
    if (!ssoBaseUrl) {
      return undefined;
    }
    return new URL('/docs/user/sso-providers', ssoBaseUrl).toString();
  }, [ssoBaseUrl]);
  const docsAuthentikPermissionsUrl = React.useMemo(() => {
    if (!ssoBaseUrl) {
      return undefined;
    }
    return new URL('/docs/user/sso-authentik-permissions', ssoBaseUrl).toString();
  }, [ssoBaseUrl]);
  const samlCallbackUrl = React.useMemo(() => {
    if (!providerDetails?.id) {
      return '';
    }

    try {
      if (!ssoBaseUrl) {
        return '';
      }
      const callbackUrl = new URL(ssoBaseUrl);
      callbackUrl.pathname = `/api/auth/sso/${SSOProviderType.SAML}/${providerDetails.id}/callback*`;
      callbackUrl.search = '';
      callbackUrl.hash = '';
      return callbackUrl.toString();
    } catch {
      return '';
    }
  }, [providerDetails?.id, ssoBaseUrl]);
  const oidcCallbackUrl = React.useMemo(() => {
    if (!providerDetails?.id) {
      return '';
    }

    try {
      if (!ssoBaseUrl) {
        return '';
      }
      const callbackUrl = new URL(ssoBaseUrl);
      callbackUrl.pathname = `/api/auth/sso/${SSOProviderType.OIDC}/${providerDetails.id}/callback`;
      callbackUrl.search = '';
      callbackUrl.hash = '';
      return callbackUrl.toString();
    } catch {
      return '';
    }
  }, [providerDetails?.id, ssoBaseUrl]);
  const authentikRedirectRegexPattern = React.useMemo(() => {
    const baseUrl = ssoBaseUrl ? escapeRegex(ssoBaseUrl) : 'http://localhost:3000';
    const providerId = providerDetails?.id ?? 1;
    return `^${baseUrl}/api/auth/sso/OIDC/${providerId}/callback(\\?.*)?$`;
  }, [providerDetails?.id, ssoBaseUrl]);
  const hasSetupUrls = Boolean(providerDetails?.id && ssoBaseUrl);

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

  const buildPermissionMappingInputs = (mapping?: SSOPermissionMappingsDto | null) => ({
    canManageResources: Array.isArray(mapping?.canManageResources) ? mapping?.canManageResources.join(', ') : '',
    canManageSystemConfiguration: Array.isArray(mapping?.canManageSystemConfiguration)
      ? mapping?.canManageSystemConfiguration.join(', ')
      : '',
    canManageUsers: Array.isArray(mapping?.canManageUsers) ? mapping?.canManageUsers.join(', ') : '',
    canManageBilling: Array.isArray(mapping?.canManageBilling) ? mapping?.canManageBilling.join(', ') : '',
  });

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

  const handleAddNew = () => {
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
  };

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    handleAddNew,
  }));

  const handleEdit = (provider: SSOProvider) => {
    setEditingProvider(provider);
    open();
  };

  const handleDelete = async (id: number) => {
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
  };

  const setOidc = (field: keyof NonNullable<CreateSSOProviderDto['oidcConfiguration']>, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      oidcConfiguration: { ...ensureOidcConfiguration(prev.oidcConfiguration), [field]: value },
    }));
  };

  const setSaml = (field: keyof NonNullable<CreateSSOProviderDto['samlConfiguration']>, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      samlConfiguration: { ...ensureSamlConfiguration(prev.samlConfiguration), [field]: value },
    }));
  };

  const handleCopyValue = useCallback(
    async (value: string, successTitle: string) => {
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
          title: successTitle,
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

  const handleCopySamlCallbackUrl = useCallback(async () => {
    if (!samlCallbackUrl) {
      return;
    }

    await handleCopyValue(samlCallbackUrl, t('copySuccessTitle'));
  }, [handleCopyValue, samlCallbackUrl, t]);

  const handleCopyOidcCallbackUrl = useCallback(async () => {
    if (!oidcCallbackUrl) {
      return;
    }

    await handleCopyValue(oidcCallbackUrl, t('copySuccessTitle'));
  }, [handleCopyValue, oidcCallbackUrl, t]);

  const handleCopyLoginUrl = useCallback(
    async (value: string) => {
      if (!value) {
        return;
      }
      await handleCopyValue(value, t('copySuccessTitle'));
    },
    [handleCopyValue, t],
  );

  const handleSamlToggleChange = (
    field: keyof NonNullable<CreateSSOProviderDto['samlConfiguration']>,
    nextValue: boolean,
  ) => {
    setFormValues((prev) => ({
      ...prev,
      samlConfiguration: {
        ...ensureSamlConfiguration(prev.samlConfiguration),
        [field]: nextValue,
      },
    }));
  };

  const handleSelectChange = (value: SSOProviderType) => {
    setFormValues((prev) => ({
      ...prev,
      type: value,
      oidcConfiguration:
        value === SSOProviderType.OIDC ? ensureOidcConfiguration(prev.oidcConfiguration) : prev.oidcConfiguration,
      samlConfiguration:
        value === SSOProviderType.SAML ? ensureSamlConfiguration(prev.samlConfiguration) : prev.samlConfiguration,
    }));
  };

  const handleSubmit = async () => {
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
      close();

      // Invalidate query after successful submission - Already handled by onSuccess handlers
      // queryClient.invalidateQueries({
      //   queryKey: UseAuthenticationServiceGetAllSsoProvidersKeyFn(),
      // });
    } catch (err) {
      const errorDescription = editingProvider ? t('failedToUpdate') : t('failedToCreate');
      showError({
        title: t('errorGeneric'),
        description: err instanceof Error ? err.message : errorDescription,
      });
    }
  };

  if (error) {
    return <div className="text-red-500 p-4">{t('errorLoading')}</div>;
  }

  return (
    <>
      {providers && providers.length > 0 ? (
        <Table aria-label={t('table.ariaLabel')} data-cy="sso-providers-table">
          <TableHeader>
            <TableColumn>{t('id')}</TableColumn>
            <TableColumn>{t('name')}</TableColumn>
            <TableColumn>{t('type')}</TableColumn>
            <TableColumn>{t('actions')}</TableColumn>
          </TableHeader>
          <TableBody
            items={providers}
            loadingState={loadingState}
            loadingContent={<TableDataLoadingIndicator />}
            emptyContent={<EmptyState />}
          >
            {(provider) => (
              <TableRow key={provider.id} id={provider.id}>
                <TableCell>
                  <span className="font-mono text-sm">{provider.id}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Key size={16} />
                    {provider.name}
                  </div>
                </TableCell>
                <TableCell>{provider.type}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Tooltip content={t('edit')}>
                      <Button variant="ghost"
                        size="sm"
                        isIconOnly
                        onPress={() => handleEdit(provider)}
                        data-cy={`sso-provider-edit-button-${provider.id}`}
                      >
                        <Pencil size={16} />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('deleteText')}>
                      <Button variant="danger-soft"
                        size="sm"
                        isIconOnly
                        onPress={() => handleDelete(provider.id)}
                        data-cy={`sso-provider-delete-button-${provider.id}`}
                      >
                        <Trash size={16} />
                      </Button>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <div className="text-center p-8 rounded-lg border dark:border-gray-700 border-gray-200">
          <div className="text-gray-500 dark:text-gray-400">{t('noProviders')}</div>
        </div>
      )}

      {/* Main Provider Form Modal */}
      <Modal
        isOpen={isOpen}
        onOpenChange={setOpen}
        data-cy="sso-provider-form-modal"
      >
        <ModalBackdrop />
        <ModalContainer size="2xl" scrollBehavior="inside">
          <ModalDialog>
            {({ close }) => (
            <>
              <ModalHeader><ModalHeading>{editingProvider ? t('editProvider') : t('createNewProvider')}</ModalHeading></ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <TextField
                    isRequired
                    value={formValues.name}
                    onChange={(v) => setFormValues((prev) => ({ ...prev, name: v }))}
                  >
                    <Label>{t('name')}</Label>
                    <Input placeholder="e.g. Company OIDC" data-cy="sso-provider-form-name-input" />
                  </TextField>

                  <Select
                    items={Object.values(SSOProviderType).map((type) => ({ key: type, label: type }))}
                    label={t('type')}
                    selectedKey={formValues.type}
                    onSelectionChange={(key) => handleSelectChange(key as SSOProviderType)}
                    isRequired
                    data-cy="sso-provider-form-type-select"
                  />

                  {formValues.type === SSOProviderType.OIDC && (
                    <>
                      <Divider className="my-4" />
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileCode size={16} />
                          <span className="font-semibold">{t('oidcConfiguration')}</span>
                        </div>

                        <AuthentikDiscoveryDialog onDiscovery={onAutoDiscovery}>
                          {(onOpenAuthentikDiscovery) => (
                            <KeycloakDiscoveryDialog onDiscovery={onAutoDiscovery}>
                              {(onOpenKeycloakDiscovery) => (
                                <Dropdown>
                                  <DropdownTrigger>
                                    <Button variant="ghost" startContent={<MoreVertical className="w-4 h-4" />}>
                                      {t('autoDiscovery.label')}
                                    </Button>
                                  </DropdownTrigger>
                                  <DropdownMenu aria-label="OIDC auto discovery options">
                                    <DropdownItem
                                      key="authentik" id="authentik"
                                      onPress={onOpenAuthentikDiscovery}
                                      data-cy="sso-provider-form-authentik-discovery-button"
                                    >
                                      {t('autoDiscovery.authentik')}
                                    </DropdownItem>

                                    <DropdownItem
                                      key="keycloak" id="keycloak"
                                      onPress={onOpenKeycloakDiscovery}
                                      data-cy="sso-provider-form-keycloak-discovery-button"
                                    >
                                      {t('autoDiscovery.keycloak')}
                                    </DropdownItem>
                                  </DropdownMenu>
                                </Dropdown>
                              )}
                            </KeycloakDiscoveryDialog>
                          )}
                        </AuthentikDiscoveryDialog>
                      </div>

                      <TextField isRequired value={formValues.oidcConfiguration?.issuer ?? ''} onChange={(v) => setOidc('issuer', v)}>
                        <Label>{t('issuer')}</Label>
                        <Input placeholder="https://sso.example.com/auth/realms/example" data-cy="sso-provider-form-oidc-issuer-input" />
                      </TextField>

                      <TextField isRequired value={formValues.oidcConfiguration?.authorizationURL ?? ''} onChange={(v) => setOidc('authorizationURL', v)}>
                        <Label>{t('authorizationURL')}</Label>
                        <Input placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/auth" data-cy="sso-provider-form-oidc-authorization-url-input" />
                      </TextField>

                      <TextField isRequired value={formValues.oidcConfiguration?.tokenURL ?? ''} onChange={(v) => setOidc('tokenURL', v)}>
                        <Label>{t('tokenURL')}</Label>
                        <Input placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/token" data-cy="sso-provider-form-oidc-token-url-input" />
                      </TextField>

                      <TextField isRequired value={formValues.oidcConfiguration?.userInfoURL ?? ''} onChange={(v) => setOidc('userInfoURL', v)}>
                        <Label>{t('userInfoURL')}</Label>
                        <Input placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/userinfo" data-cy="sso-provider-form-oidc-user-info-url-input" />
                      </TextField>

                      <TextField isRequired value={formValues.oidcConfiguration?.clientId ?? ''} onChange={(v) => setOidc('clientId', v)}>
                        <Label>{t('clientId')}</Label>
                        <Input placeholder="your-client-id" data-cy="sso-provider-form-oidc-client-id-input" />
                      </TextField>

                      <TextField isRequired value={formValues.oidcConfiguration?.clientSecret ?? ''} onChange={(v) => setOidc('clientSecret', v)}>
                        <Label>{t('clientSecret')}</Label>
                        <InputGroup>
                          <Input type={showClientSecret ? 'text' : 'password'} placeholder="••••••••••••••••" data-cy="sso-provider-form-oidc-client-secret-input" />
                          <Tooltip content={showClientSecret ? t('hideClientSecret') : t('showClientSecret')}>
                            <Button variant="ghost"
                              isIconOnly
                              size="sm"
                              onPress={() => setShowClientSecret(!showClientSecret)}
                              data-cy="sso-provider-form-oidc-toggle-client-secret-button"
                            >
                              {showClientSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                          </Tooltip>
                        </InputGroup>
                      </TextField>

                      <Divider className="my-2" />
                      <TextField value={scopesInput} onChange={setScopesInput}>
                        <Label>{t('scopes')}</Label>
                        <Input placeholder="openid, email, profile" data-cy="sso-provider-form-oidc-scopes-input" />
                      </TextField>
                      <TextField value={usernameClaimPathsInput} onChange={setUsernameClaimPathsInput}>
                        <Label>{t('usernameClaimPaths')}</Label>
                        <Input placeholder="preferred_username, email, sub" data-cy="sso-provider-form-oidc-username-claims-input" />
                      </TextField>
                      <TextField value={emailClaimPathsInput} onChange={setEmailClaimPathsInput}>
                        <Label>{t('emailClaimPaths')}</Label>
                        <Input placeholder="email, emails[0].value, upn" data-cy="sso-provider-form-oidc-email-claims-input" />
                      </TextField>

                      <Divider className="my-2" />
                      <div className="flex items-center gap-2 mb-2">
                        <Key size={16} />
                        <span className="font-semibold">{t('permissionMappings')}</span>
                      </div>
                      <p className="text-xs text-default-500">{t('permissionMappingsHint')}</p>
                      {permissionKeys.map((permissionKey) => (
                        <TextField
                          key={`oidc-permission-${permissionKey}`}
                          value={oidcPermissionMappingsInput[permissionKey]}
                          onChange={(v) => setOidcPermissionMappingsInput((prev) => ({ ...prev, [permissionKey]: v }))}
                        >
                          <Label>{t(`permissionMappingLabels.${permissionKey}`)}</Label>
                          <Input placeholder={t('permissionMappingsPlaceholder')} data-cy={`sso-provider-form-oidc-permission-mapping-${permissionKey}`} />
                        </TextField>
                      ))}
                    </>
                  )}
                  {formValues.type === SSOProviderType.SAML && (
                    <>
                      <Divider className="my-4" />
                      <div className="flex items-center gap-2 mb-2">
                        <FileCode size={16} />
                        <span className="font-semibold">{t('samlConfiguration')}</span>
                      </div>

                      <TextField isRequired value={formValues.samlConfiguration?.entryPoint ?? ''} onChange={(v) => setSaml('entryPoint', v)}>
                        <Label>{t('entryPoint')}</Label>
                        <Input placeholder="https://idp.example.com/realms/master/protocol/saml" data-cy="sso-provider-form-saml-entry-point-input" />
                      </TextField>

                      <TextField isRequired value={formValues.samlConfiguration?.issuer ?? ''} onChange={(v) => setSaml('issuer', v)}>
                        <Label>{t('issuer')}</Label>
                        <Input placeholder={window.location.origin ?? ''} data-cy="sso-provider-form-saml-issuer-input" />
                      </TextField>

                      <Textarea
                        label={t('certificate')}
                        name="samlConfiguration.certificate"
                        value={formValues.samlConfiguration?.certificate ?? ''}
                        onChange={(e) => setSaml('certificate', e.target.value)}
                        placeholder="MIICmzCCAYMCBg..."
                        minRows={4}
                        isRequired
                        data-cy="sso-provider-form-saml-certificate-input"
                      />
                      <p className="text-xs text-default-500">{t('certificateHint')}</p>

                      <TextField value={formValues.samlConfiguration?.audience ?? ''} onChange={(v) => setSaml('audience', v)}>
                        <Label>{t('audience')}</Label>
                        <Input placeholder={window.location.origin ?? ''} data-cy="sso-provider-form-saml-audience-input" />
                      </TextField>

                      <TextField value={emailAttributeKeysInput} onChange={setEmailAttributeKeysInput}>
                        <Label>{t('emailAttributeKeys')}</Label>
                        <Input placeholder="email, mail, urn:oid:1.2.840.113549.1.9.1" data-cy="sso-provider-form-saml-email-attribute-keys-input" />
                        <Description>{t('emailAttributeKeysHint')}</Description>
                      </TextField>

                      <TextField value={formValues.samlConfiguration?.provisioningSecret ?? ''} onChange={(v) => setSaml('provisioningSecret', v)}>
                        <Label>{t('samlProvisioningSecret')}</Label>
                        <InputGroup>
                          <Input type={showSamlProvisioningSecret ? 'text' : 'password'} placeholder="••••••••••••••••" data-cy="sso-provider-form-saml-provisioning-secret-input" />
                          <Tooltip content={showSamlProvisioningSecret ? t('hideSamlProvisioningSecret') : t('showSamlProvisioningSecret')}>
                            <Button variant="ghost"
                              isIconOnly
                              size="sm"
                              onPress={() => setShowSamlProvisioningSecret(!showSamlProvisioningSecret)}
                              data-cy="sso-provider-form-saml-provisioning-secret-toggle-button"
                            >
                              {showSamlProvisioningSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                          </Tooltip>
                        </InputGroup>
                        <Description>{t('samlProvisioningSecretHint')}</Description>
                      </TextField>

                      <Divider className="my-2" />
                      <div className="flex items-center gap-2 mb-2">
                        <Key size={16} />
                        <span className="font-semibold">{t('permissionMappings')}</span>
                      </div>
                      <p className="text-xs text-default-500">{t('permissionMappingsHint')}</p>
                      {permissionKeys.map((permissionKey) => (
                        <TextField
                          key={`saml-permission-${permissionKey}`}
                          value={samlPermissionMappingsInput[permissionKey]}
                          onChange={(v) => setSamlPermissionMappingsInput((prev) => ({ ...prev, [permissionKey]: v }))}
                        >
                          <Label>{t(`permissionMappingLabels.${permissionKey}`)}</Label>
                          <Input placeholder={t('permissionMappingsPlaceholder')} data-cy={`sso-provider-form-saml-permission-mapping-${permissionKey}`} />
                        </TextField>
                      ))}

                      <Textarea
                        label={t('spSigningCertificate')}
                        name="samlConfiguration.spSigningCertificate"
                        value={formValues.samlConfiguration?.spSigningCertificate ?? ''}
                        onChange={(e) => setSaml('spSigningCertificate', e.target.value)}
                        placeholder="MIICmzCCAYMCBg..."
                        minRows={4}
                        data-cy="sso-provider-form-saml-sp-certificate-input"
                      />
                      <p className="text-xs text-default-500">{t('spSigningCertificateHint')}</p>

                      <Textarea
                        label={t('spSigningPrivateKey')}
                        name="samlConfiguration.spSigningPrivateKey"
                        value={formValues.samlConfiguration?.spSigningPrivateKey ?? ''}
                        onChange={(e) => setSaml('spSigningPrivateKey', e.target.value)}
                        placeholder="-----BEGIN PRIVATE KEY-----"
                        minRows={4}
                        data-cy="sso-provider-form-saml-sp-private-key-input"
                      />
                      <p className="text-xs text-default-500">
                        {providerDetails?.samlConfiguration?.spSigningKeyEncrypted
                          ? t('spSigningPrivateKeyHintExisting')
                          : t('spSigningPrivateKeyHint')}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Switch
                          isSelected={formValues.samlConfiguration?.signRequest ?? false}
                          onValueChange={(value) => handleSamlToggleChange('signRequest', value)}
                          data-cy="sso-provider-form-saml-sign-request-switch"
                        >
                          {t('signRequest')}
                        </Switch>
                        <Switch
                          isSelected={formValues.samlConfiguration?.wantAssertionsSigned ?? false}
                          onValueChange={(value) => handleSamlToggleChange('wantAssertionsSigned', value)}
                          data-cy="sso-provider-form-saml-assertions-signed-switch"
                        >
                          {t('wantAssertionsSigned')}
                        </Switch>
                        <Switch
                          isSelected={formValues.samlConfiguration?.wantAuthnResponseSigned ?? true}
                          onValueChange={(value) => handleSamlToggleChange('wantAuthnResponseSigned', value)}
                          data-cy="sso-provider-form-saml-response-signed-switch"
                        >
                          {t('wantAuthnResponseSigned')}
                        </Switch>
                        <Switch
                          isSelected={formValues.samlConfiguration?.forceAuthn ?? false}
                          onValueChange={(value) => handleSamlToggleChange('forceAuthn', value)}
                          data-cy="sso-provider-form-saml-force-authn-switch"
                        >
                          {t('forceAuthn')}
                        </Switch>
                      </div>
                    </>
                  )}

                  <Divider className="my-4" />
                  <Card className="border border-default-200" data-cy="sso-provider-form-setup-card">
                    <CardHeader className="flex items-center gap-2">
                      <Info size={16} />
                      <span className="font-semibold">{t('setupInstructions')}</span>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <p className="text-xs text-default-500">{t('setupInstructionsHint')}</p>
                      <div className="flex flex-col gap-3">
                        {!isSamlProvider && (
                          <TextField isReadOnly isDisabled={!hasSetupUrls} value={authentikRedirectRegexPattern}>
                            <Label>{t('authentikRedirectRegex')}</Label>
                            {hasSetupUrls ? (
                              <InputGroup>
                                <Input data-cy="sso-provider-form-authentik-regex" />
                                <Button variant="ghost"
                                  size="sm"
                                  onPress={() => handleCopyLoginUrl(authentikRedirectRegexPattern)}
                                  startContent={<Copy size={24} />}
                                  data-cy="sso-provider-form-authentik-regex-copy-button"
                                >
                                  {t('copy')}
                                </Button>
                              </InputGroup>
                            ) : (
                              <Input data-cy="sso-provider-form-authentik-regex" />
                            )}
                            <Description>{hasSetupUrls ? t('authentikRedirectRegexDescription') : t('setupUrlPending')}</Description>
                          </TextField>
                        )}
                        <TextField isReadOnly isDisabled={!hasSetupUrls} value={isSamlProvider ? samlCallbackUrl : oidcCallbackUrl}>
                          <Label>{isSamlProvider ? t('samlAcsUrl') : t('oidcRedirectUri')}</Label>
                          {hasSetupUrls ? (
                            <InputGroup>
                              <Input data-cy="sso-provider-form-callback-url" />
                              <Button variant="ghost"
                                size="sm"
                                onPress={isSamlProvider ? handleCopySamlCallbackUrl : handleCopyOidcCallbackUrl}
                                startContent={<Copy size={24} />}
                                data-cy="sso-provider-form-callback-url-copy-button"
                              >
                                {t('copy')}
                              </Button>
                            </InputGroup>
                          ) : (
                            <Input data-cy="sso-provider-form-callback-url" />
                          )}
                          <Description>
                            {hasSetupUrls
                              ? isSamlProvider
                                ? t('samlAcsUrlDescription')
                                : t('oidcRedirectUriDescription')
                              : t('setupUrlPending')}
                          </Description>
                        </TextField>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs">
                        {docsSsoProvidersUrl && (
                          <Link href={docsSsoProvidersUrl} isExternal showAnchorIcon>
                            {t('docsSsoProviders')}
                          </Link>
                        )}
                        {docsAuthentikPermissionsUrl && (
                          <Link href={docsAuthentikPermissionsUrl} isExternal showAnchorIcon>
                            {t('docsAuthentikPermissions')}
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={close} data-cy="sso-provider-form-cancel-button">
                  {t('cancel')}
                </Button>
                <Button variant="primary"
                  onPress={handleSubmit}
                  isDisabled={isSaveDisabled}
                  isPending={isMutationPending}
                  data-cy="sso-provider-form-save-button"
                >
                  {t('save')}
                </Button>
              </ModalFooter>
            </>
          )}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </>
  );
});
