import React, { useState, forwardRef, useImperativeHandle } from 'react';
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
  Select,
  SelectItem,
  Divider,
} from '@heroui/react';
import { Pencil, Trash, Key, FileCode, Eye, EyeOff, Download } from 'lucide-react';
import { useToastMessage } from '../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  CreateSSOProviderDto,
  SSOProvider,
  SSOProviderType,
  UpdateSSOProviderDto,
  useAuthenticationServiceCreateOneSsoProvider,
  useAuthenticationServiceDeleteOneSsoProvider,
  useAuthenticationServiceGetAllSsoProviders,
  useAuthenticationServiceGetOneSsoProviderById,
  useAuthenticationServiceUpdateOneSsoProvider,
  UseAuthenticationServiceGetAllSsoProvidersKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { EmptyState } from '../../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';

import * as en from './translations/en';
import * as de from './translations/de';

// Interface for the OpenID Configuration response
interface OpenIDConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  [key: string]: unknown;
}

const defaultProviderValues: CreateSSOProviderDto = {
  name: '',
  type: 'OIDC' as SSOProviderType.OIDC,
  oidcConfiguration: {
    issuer: '',
    authorizationURL: '',
    tokenURL: '',
    userInfoURL: '',
    clientId: '',
    clientSecret: '',
  },
};

export interface SSOProvidersListRef {
  handleAddNew: () => void;
}

export const SSOProvidersList = forwardRef<SSOProvidersListRef, React.ComponentPropsWithoutRef<'div'>>((props, ref) => {
  const { t } = useTranslations('ssoProvidersList', { en, de });
  const { data: providers, status: fetchStatus, error } = useAuthenticationServiceGetAllSsoProviders();
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();
  const [editingProvider, setEditingProvider] = useState<SSOProvider | null>(null);
  const [formValues, setFormValues] = useState<CreateSSOProviderDto>(defaultProviderValues);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [keycloakHost, setKeycloakHost] = useState('');
  const [keycloakRealm, setKeycloakRealm] = useState('');
  const [isDiscoverDialogOpen, setIsDiscoverDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

  const { success, error: showError } = useToastMessage();
  const createSSOProvider = useAuthenticationServiceCreateOneSsoProvider({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UseAuthenticationServiceGetAllSsoProvidersKeyFn()[0]],
      });
    },
  });
  const updateSSOProvider = useAuthenticationServiceUpdateOneSsoProvider({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UseAuthenticationServiceGetAllSsoProvidersKeyFn()[0]],
      });
    },
  });
  const deleteSSOProvider = useAuthenticationServiceDeleteOneSsoProvider({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [UseAuthenticationServiceGetAllSsoProvidersKeyFn()[0]],
      });
    },
  });
  const { data: providerDetails } = useAuthenticationServiceGetOneSsoProviderById(
    { id: editingProvider?.id as number },
    undefined,
    {
      enabled: !!editingProvider,
    }
  );

  // Function to discover OIDC configuration from Keycloak
  const discoverOIDCConfiguration = async () => {
    if (!keycloakHost || !keycloakRealm) {
      showError({
        title: t('errorGeneric'),
        description: t('fillAllFields'),
      });
      return;
    }

    setIsDiscovering(true);

    try {
      // Normalize the host URL to ensure it doesn't end with a trailing slash
      const normalizedHost = keycloakHost.endsWith('/') ? keycloakHost.slice(0, -1) : keycloakHost;

      // Construct the well-known endpoint URL
      const wellKnownUrl = `${normalizedHost}/realms/${keycloakRealm}/.well-known/openid-configuration`;

      // Fetch the configuration
      const response = await fetch(wellKnownUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch configuration: ${response.statusText}`);
      }

      const config: OpenIDConfiguration = await response.json();

      // Update the form values with the discovered configuration
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

      // Show success message
      success({
        title: t('discoverSuccess'),
        description: config.issuer,
      });

      // Close the discovery dialog
      setIsDiscoverDialogOpen(false);
    } catch (err) {
      showError({
        title: t('discoverError'),
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  // Set form values when provider details are loaded
  React.useEffect(() => {
    if (providerDetails && editingProvider) {
      const extendedProvider = providerDetails;
      const updatedFormValues: CreateSSOProviderDto = {
        name: extendedProvider.name,
        type: extendedProvider.type as SSOProviderType,
      };

      if (extendedProvider.type === 'OIDC' && extendedProvider.oidcConfiguration) {
        updatedFormValues.oidcConfiguration = {
          issuer: extendedProvider.oidcConfiguration.issuer,
          authorizationURL: extendedProvider.oidcConfiguration.authorizationURL,
          tokenURL: extendedProvider.oidcConfiguration.tokenURL,
          userInfoURL: extendedProvider.oidcConfiguration.userInfoURL,
          clientId: extendedProvider.oidcConfiguration.clientId,
          clientSecret: extendedProvider.oidcConfiguration.clientSecret,
        };
      }

      setFormValues(updatedFormValues);
    }
  }, [providerDetails, editingProvider]);

  const handleAddNew = () => {
    setEditingProvider(null);
    setFormValues(defaultProviderValues);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name.includes('.')) {
      const [section, field] = name.split('.');
      if (section === 'oidcConfiguration') {
        setFormValues((prev) => {
          // Ensure we have a valid oidcConfiguration object
          const currentConfig = prev.oidcConfiguration ?? {
            issuer: '',
            authorizationURL: '',
            tokenURL: '',
            userInfoURL: '',
            clientId: '',
            clientSecret: '',
          };

          // Use type assertion to help TypeScript understand the structure
          const newFormValues = {
            ...prev,
            oidcConfiguration: {
              ...currentConfig,
              [field]: value,
            },
          } as CreateSSOProviderDto;

          return newFormValues;
        });
      }
    } else {
      setFormValues((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSelectChange = (value: string) => {
    setFormValues((prev) => ({
      ...prev,
      type: value as SSOProviderType,
    }));
  };

  const handleSubmit = async () => {
    try {
      if (editingProvider) {
        await updateSSOProvider.mutateAsync({
          id: editingProvider.id,
          requestBody: formValues as UpdateSSOProviderDto,
        });
        success({
          title: t('providerUpdated'),
          description: t('providerUpdatedDesc'),
        });
      } else {
        await createSSOProvider.mutateAsync({ requestBody: formValues });
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
        <Table aria-label="SSO Providers List" data-cy="sso-providers-table">
          <TableHeader>
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

      {/* Discover Configuration Dialog */}
      <Modal
        isOpen={isDiscoverDialogOpen}
        onOpenChange={(open) => setIsDiscoverDialogOpen(open)}
        size="md"
        scrollBehavior="inside"
        data-cy="sso-discover-config-modal"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('discoverFromKeycloak')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('discoverDescription')}</p>
                <div className="space-y-4">
                  <Input
                    label={t('keycloakHost')}
                    value={keycloakHost}
                    onChange={(e) => setKeycloakHost(e.target.value)}
                    placeholder={t('discoverPlaceholder')}
                    isRequired
                    data-cy="sso-discover-config-keycloak-host-input"
                  />

                  <Input
                    label={t('keycloakRealm')}
                    value={keycloakRealm}
                    onChange={(e) => setKeycloakRealm(e.target.value)}
                    placeholder={t('realmPlaceholder')}
                    isRequired
                    data-cy="sso-discover-config-keycloak-realm-input"
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose} data-cy="sso-discover-config-cancel-button">
                  {t('cancel')}
                </Button>
                <Button
                  color="primary"
                  onPress={discoverOIDCConfiguration}
                  isLoading={isDiscovering}
                  startContent={!isDiscovering && <Download size={16} />}
                  data-cy="sso-discover-config-discover-button"
                >
                  {t('discover')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

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
                    label={t('type')}
                    selectedKeys={[formValues.type]}
                    onChange={(e) => handleSelectChange(e.target.value)}
                    isRequired
                    data-cy="sso-provider-form-type-select"
                  >
                    <SelectItem key="OIDC" data-cy="sso-provider-form-type-oidc-select-item">
                      {t('oidc')}
                    </SelectItem>
                  </Select>

                  {formValues.type === 'OIDC' && (
                    <>
                      <Divider className="my-4" />
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileCode size={16} />
                          <span className="font-semibold">{t('oidcConfiguration')}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
                          startContent={<Download size={16} />}
                          onPress={() => setIsDiscoverDialogOpen(true)}
                          data-cy="sso-provider-form-discover-from-keycloak-button"
                        >
                          {t('discoverFromKeycloak')}
                        </Button>
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
                    </>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose} data-cy="sso-provider-form-cancel-button">
                  {t('cancel')}
                </Button>
                <Button color="primary" onPress={handleSubmit} data-cy="sso-provider-form-save-button">
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
