import { Input, Label, Spinner, TextField } from '@heroui/react';
import { Navigate, useParams } from 'react-router-dom';
import { SSOProviderType, useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { PageHeader } from '../../../components/pageHeader';
import { OIDCConfigForm } from './form/OIDCConfigForm';
import { SAMLConfigForm } from './form/SAMLConfigForm';
import { SetupInstructionsSection } from './form/SetupInstructionsSection';
import { SSO_PROVIDERS_PATH, useSSOProviderForm } from './useSSOProviderForm';
import { useSSOProviderSetupUrls } from './useSSOProviderSetupUrls';
import en from './en.json';
import de from './de.json';

export const SSOProviderFormPage = () => {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const canManageSSO = hasPermission('system.sso.manage');
  const { data: license } = useLicenseServiceGetLicenseInformation();

  const { providerId: providerIdParam } = useParams<{ providerId: string }>();
  const parsedProviderId = providerIdParam ? Number(providerIdParam) : undefined;
  const providerId = parsedProviderId !== undefined && Number.isFinite(parsedProviderId) ? parsedProviderId : undefined;

  const form = useSSOProviderForm(providerId);
  const setupUrls = useSSOProviderSetupUrls(providerId);

  const {
    isEditing,
    isLoadingProvider,
    formValues,
    setFormValues,
    isSamlProvider,
    isMutationPending,
    isSaveDisabled,
    handleSelectChange,
    handleSubmit,
    handleCancel,
    copyValue,
  } = form;

  // Redirect if user doesn't have permission
  if (!canManageSSO) {
    return <Navigate to="/" />;
  }

  if (license && !license.modules.includes('sso')) {
    return null;
  }

  if (isEditing && isLoadingProvider) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 flex justify-center">
        <Spinner color="accent" data-cy="sso-provider-form-page-loading-spinner" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" data-cy="sso-provider-form-page">
      <PageHeader
        title={isEditing ? t('editProvider') : t('createNewProvider')}
        backTo={SSO_PROVIDERS_PATH}
      />

      <div className="flex flex-col gap-8" data-cy="sso-provider-form">
        <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.provider')}</h3>
          <TextField
            isRequired
            value={formValues.name}
            onChange={(v) => setFormValues((prev) => ({ ...prev, name: v }))}
          >
            <Label>{t('name')}</Label>
            <Input placeholder="e.g. Company OIDC" data-cy="sso-provider-form-name-input" />
          </TextField>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t('type')}</label>
            <Select
              items={Object.values(SSOProviderType).map((type) => ({ key: type, label: type }))}
              value={formValues.type}
              onChange={(key) => {
                if (key) handleSelectChange(key as SSOProviderType);
              }}
              isRequired
              isDisabled={isEditing}
              data-cy="sso-provider-form-type-select"
            />
          </div>
        </section>

        {formValues.type === SSOProviderType.OIDC && <OIDCConfigForm form={form} />}

        {formValues.type === SSOProviderType.SAML && <SAMLConfigForm form={form} />}

        <SetupInstructionsSection isSamlProvider={isSamlProvider} setupUrls={setupUrls} onCopy={copyValue} />

        <div className="flex justify-end gap-3 pt-6 border-t border-default-200">
          <Button variant="secondary" onPress={handleCancel} data-cy="sso-provider-form-cancel-button">
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={handleSubmit}
            isDisabled={isSaveDisabled}
            isPending={isMutationPending}
            data-cy="sso-provider-form-save-button"
          >
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
};
