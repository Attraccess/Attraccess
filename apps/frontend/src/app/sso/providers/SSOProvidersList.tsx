import React, { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  Button,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
  Divider,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Textarea,
  Switch,
} from '@heroui/react';
import { Pencil, Trash, Key, FileCode, Eye, EyeOff, MoreVertical, Copy } from 'lucide-react';
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

export interface SSOProvidersListRef {
  handleAddNew: () => void;
}

export const SSOProvidersList = forwardRef<SSOProvidersListRef, React.ComponentPropsWithoutRef<'div'>>((props, ref) => {
  const { t } = useTranslations({ en, de });
  const { data: providers, status: fetchStatus, error } = useAuthenticationServiceGetAllSsoProviders();
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();
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
  const samlCallbackUrl = React.useMemo(() => {
    if (!providerDetails?.id) {
      return '';
    }

    try {
      const baseUrl = getBaseUrl() ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
      if (!baseUrl) {
        return '';
      }
      const callbackUrl = new URL(baseUrl);
      callbackUrl.pathname = `/api/auth/sso/${SSOProviderType.SAML}/${providerDetails.id}/callback*`;
      callbackUrl.search = '';
      callbackUrl.hash = '';
      return callbackUrl.toString();
    } catch {
      return '';
    }
  }, [providerDetails?.id]);
  const hasSamlCallbackUrl = Boolean(samlCallbackUrl);

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
    onOpen();
  };

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    handleAddNew,
  }));

  const handleEdit = (provider: SSOProvider) => {
    setEditingProvider(provider);
    onOpen();
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name.includes('.')) {
      const [section, field] = name.split('.');
      if (section === 'oidcConfiguration') {
        setFormValues((prev) => ({
          ...prev,
          oidcConfiguration: {
            ...ensureOidcConfiguration(prev.oidcConfiguration),
            [field]: value,
          },
        }));
      }
      if (section === 'samlConfiguration') {
        setFormValues((prev) => ({
          ...prev,
          samlConfiguration: {
            ...ensureSamlConfiguration(prev.samlConfiguration),
            [field]: value,
          },
        }));
      }
    } else {
      setFormValues((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handlePermissionMappingChange =
    (setter: React.Dispatch<React.SetStateAction<Record<PermissionKey, string>>>, key: PermissionKey) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setter((prev) => ({
          ...prev,
          [key]: event.target.value,
        }));
      };

  const handleCopySamlCallbackUrl = useCallback(async () => {
    if (!samlCallbackUrl) {
      return;
    }

    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
      showError({
        title: t('samlCallbackUrlCopyFailedTitle'),
        description: t('samlCallbackUrlCopyUnsupported'),
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(samlCallbackUrl);
      success({
        title: t('samlCallbackUrlCopiedTitle'),
      });
    } catch (err) {
      showError({
        title: t('samlCallbackUrlCopyFailedTitle'),
        description: err instanceof Error ? err.message : t('samlCallbackUrlCopyFailedDesc'),
      });
    }
  }, [samlCallbackUrl, showError, success, t]);

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
      onClose();

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
              <TableRow key={provider.id}>
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
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        onPress={() => handleEdit(provider)}
                        data-cy={`sso-provider-edit-button-${provider.id}`}
                      >
                        <Pencil size={16} />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('deleteText')}>
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        color="danger"
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
        onOpenChange={onOpenChange}
        size="2xl"
        scrollBehavior="inside"
        data-cy="sso-provider-form-modal"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{editingProvider ? t('editProvider') : t('createNewProvider')}</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label={t('name')}
                    name="name"
                    value={formValues.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Company OIDC"
                    isRequired
                    data-cy="sso-provider-form-name-input"
                  />

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
                                    <Button variant="light" startContent={<MoreVertical className="w-4 h-4" />}>
                                      {t('autoDiscovery.label')}
                                    </Button>
                                  </DropdownTrigger>
                                  <DropdownMenu aria-label="OIDC auto discovery options">
                                    <DropdownItem
                                      key="authentik"
                                      onPress={onOpenAuthentikDiscovery}
                                      data-cy="sso-provider-form-authentik-discovery-button"
                                    >
                                      {t('autoDiscovery.authentik')}
                                    </DropdownItem>

                                    <DropdownItem
                                      key="keycloak"
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

                      <Input
                        label={t('issuer')}
                        name="oidcConfiguration.issuer"
                        value={formValues.oidcConfiguration?.issuer ?? ''}
                        onChange={handleInputChange}
                        placeholder="https://sso.example.com/auth/realms/example"
                        isRequired
                        data-cy="sso-provider-form-oidc-issuer-input"
                      />

                      <Input
                        label={t('authorizationURL')}
                        name="oidcConfiguration.authorizationURL"
                        value={formValues.oidcConfiguration?.authorizationURL ?? ''}
                        onChange={handleInputChange}
                        placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/auth"
                        isRequired
                        data-cy="sso-provider-form-oidc-authorization-url-input"
                      />

                      <Input
                        label={t('tokenURL')}
                        name="oidcConfiguration.tokenURL"
                        value={formValues.oidcConfiguration?.tokenURL ?? ''}
                        onChange={handleInputChange}
                        placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/token"
                        isRequired
                        data-cy="sso-provider-form-oidc-token-url-input"
                      />

                      <Input
                        label={t('userInfoURL')}
                        name="oidcConfiguration.userInfoURL"
                        value={formValues.oidcConfiguration?.userInfoURL ?? ''}
                        onChange={handleInputChange}
                        placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/userinfo"
                        isRequired
                        data-cy="sso-provider-form-oidc-user-info-url-input"
                      />

                      <Input
                        label={t('clientId')}
                        name="oidcConfiguration.clientId"
                        value={formValues.oidcConfiguration?.clientId ?? ''}
                        onChange={handleInputChange}
                        placeholder="your-client-id"
                        isRequired
                        data-cy="sso-provider-form-oidc-client-id-input"
                      />

                      <Input
                        type={showClientSecret ? 'text' : 'password'}
                        label={t('clientSecret')}
                        name="oidcConfiguration.clientSecret"
                        value={formValues.oidcConfiguration?.clientSecret ?? ''}
                        onChange={handleInputChange}
                        placeholder="••••••••••••••••"
                        isRequired
                        data-cy="sso-provider-form-oidc-client-secret-input"
                        endContent={
                          <Tooltip content={showClientSecret ? t('hideClientSecret') : t('showClientSecret')}>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onPress={() => setShowClientSecret(!showClientSecret)}
                              data-cy="sso-provider-form-oidc-toggle-client-secret-button"
                            >
                              {showClientSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                          </Tooltip>
                        }
                      />

                      <Divider className="my-2" />
                      <Input
                        label={t('scopes')}
                        value={scopesInput}
                        onChange={(e) => setScopesInput(e.target.value)}
                        placeholder="openid, email, profile"
                        data-cy="sso-provider-form-oidc-scopes-input"
                      />
                      <Input
                        label={t('usernameClaimPaths')}
                        value={usernameClaimPathsInput}
                        onChange={(e) => setUsernameClaimPathsInput(e.target.value)}
                        placeholder="preferred_username, email, sub"
                        data-cy="sso-provider-form-oidc-username-claims-input"
                      />
                      <Input
                        label={t('emailClaimPaths')}
                        value={emailClaimPathsInput}
                        onChange={(e) => setEmailClaimPathsInput(e.target.value)}
                        placeholder="email, emails[0].value, upn"
                        data-cy="sso-provider-form-oidc-email-claims-input"
                      />

                      <Divider className="my-2" />
                      <div className="flex items-center gap-2 mb-2">
                        <Key size={16} />
                        <span className="font-semibold">{t('permissionMappings')}</span>
                      </div>
                      <p className="text-xs text-default-500">{t('permissionMappingsHint')}</p>
                      {permissionKeys.map((permissionKey) => (
                        <Input
                          key={`oidc-permission-${permissionKey}`}
                          label={t(`permissionMappingLabels.${permissionKey}`)}
                          value={oidcPermissionMappingsInput[permissionKey]}
                          onChange={handlePermissionMappingChange(setOidcPermissionMappingsInput, permissionKey)}
                          placeholder={t('permissionMappingsPlaceholder')}
                          data-cy={`sso-provider-form-oidc-permission-mapping-${permissionKey}`}
                        />
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

                      <Input
                        label={t('entryPoint')}
                        name="samlConfiguration.entryPoint"
                        value={formValues.samlConfiguration?.entryPoint ?? ''}
                        onChange={handleInputChange}
                        placeholder="https://idp.example.com/realms/master/protocol/saml"
                        isRequired
                        data-cy="sso-provider-form-saml-entry-point-input"
                      />

                      <Input
                        label={t('issuer')}
                        name="samlConfiguration.issuer"
                        value={formValues.samlConfiguration?.issuer ?? ''}
                        onChange={handleInputChange}
                        placeholder={window.location.origin ?? ''}
                        isRequired
                        data-cy="sso-provider-form-saml-issuer-input"
                      />

                      <Textarea
                        label={t('certificate')}
                        name="samlConfiguration.certificate"
                        value={formValues.samlConfiguration?.certificate ?? ''}
                        onChange={handleInputChange}
                        placeholder="MIICmzCCAYMCBg..."
                        minRows={4}
                        isRequired
                        data-cy="sso-provider-form-saml-certificate-input"
                      />
                      <p className="text-xs text-default-500">{t('certificateHint')}</p>

                      <Input
                        label={t('audience')}
                        name="samlConfiguration.audience"
                        value={formValues.samlConfiguration?.audience ?? ''}
                        onChange={handleInputChange}
                        placeholder={window.location.origin ?? ''}
                        data-cy="sso-provider-form-saml-audience-input"
                      />

                      <Input
                        label={t('samlCallbackUrl')}
                        value={samlCallbackUrl}
                        isReadOnly
                        isDisabled={!hasSamlCallbackUrl}
                        description={hasSamlCallbackUrl ? t('samlCallbackUrlDescription') : t('samlCallbackUrlPending')}
                        endContent={
                          hasSamlCallbackUrl ? (
                            <Button
                              size="sm"
                              variant="light"
                              onPress={handleCopySamlCallbackUrl}
                              startContent={<Copy size={24} />}
                              data-cy="sso-provider-form-saml-callback-url-copy-button"
                            >
                              {t('copy')}
                            </Button>
                          ) : undefined
                        }
                        data-cy="sso-provider-form-saml-callback-url"
                      />

                      <Input
                        label={t('emailAttributeKeys')}
                        description={t('emailAttributeKeysHint')}
                        value={emailAttributeKeysInput}
                        onChange={(e) => setEmailAttributeKeysInput(e.target.value)}
                        placeholder="email, mail, urn:oid:1.2.840.113549.1.9.1"
                        data-cy="sso-provider-form-saml-email-attribute-keys-input"
                      />

                      <Input
                        type={showSamlProvisioningSecret ? 'text' : 'password'}
                        label={t('samlProvisioningSecret')}
                        name="samlConfiguration.provisioningSecret"
                        value={formValues.samlConfiguration?.provisioningSecret ?? ''}
                        onChange={handleInputChange}
                        placeholder="••••••••••••••••"
                        description={t('samlProvisioningSecretHint')}
                        data-cy="sso-provider-form-saml-provisioning-secret-input"
                        endContent={
                          <Tooltip
                            content={showSamlProvisioningSecret ? t('hideSamlProvisioningSecret') : t('showSamlProvisioningSecret')}
                          >
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onPress={() => setShowSamlProvisioningSecret(!showSamlProvisioningSecret)}
                              data-cy="sso-provider-form-saml-provisioning-secret-toggle-button"
                            >
                              {showSamlProvisioningSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                          </Tooltip>
                        }
                      />

                      <Divider className="my-2" />
                      <div className="flex items-center gap-2 mb-2">
                        <Key size={16} />
                        <span className="font-semibold">{t('permissionMappings')}</span>
                      </div>
                      <p className="text-xs text-default-500">{t('permissionMappingsHint')}</p>
                      {permissionKeys.map((permissionKey) => (
                        <Input
                          key={`saml-permission-${permissionKey}`}
                          label={t(`permissionMappingLabels.${permissionKey}`)}
                          value={samlPermissionMappingsInput[permissionKey]}
                          onChange={handlePermissionMappingChange(setSamlPermissionMappingsInput, permissionKey)}
                          placeholder={t('permissionMappingsPlaceholder')}
                          data-cy={`sso-provider-form-saml-permission-mapping-${permissionKey}`}
                        />
                      ))}

                      <Textarea
                        label={t('spSigningCertificate')}
                        name="samlConfiguration.spSigningCertificate"
                        value={formValues.samlConfiguration?.spSigningCertificate ?? ''}
                        onChange={handleInputChange}
                        placeholder="MIICmzCCAYMCBg..."
                        minRows={4}
                        data-cy="sso-provider-form-saml-sp-certificate-input"
                      />
                      <p className="text-xs text-default-500">{t('spSigningCertificateHint')}</p>

                      <Textarea
                        label={t('spSigningPrivateKey')}
                        name="samlConfiguration.spSigningPrivateKey"
                        value={formValues.samlConfiguration?.spSigningPrivateKey ?? ''}
                        onChange={handleInputChange}
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
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose} data-cy="sso-provider-form-cancel-button">
                  {t('cancel')}
                </Button>
                <Button
                  color="primary"
                  onPress={handleSubmit}
                  isDisabled={isSaveDisabled}
                  isLoading={isMutationPending}
                  data-cy="sso-provider-form-save-button"
                >
                  {t('save')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
});
