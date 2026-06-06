import { DrawerBody, DrawerFooter, DrawerHeader, Input, Label, TextField } from '@heroui/react';
import { SSOProviderType } from '@attraccess/react-query-client';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { StandardDrawer } from '../../../components/standardDrawer';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { OIDCConfigForm } from './form/OIDCConfigForm';
import { SAMLConfigForm } from './form/SAMLConfigForm';
import { SetupInstructionsSection } from './form/SetupInstructionsSection';
import { SSOProviderFormApi } from './useSSOProviderForm';
import { SSOProviderSetupUrls } from './useSSOProviderSetupUrls';
import en from './en.json';
import de from './de.json';

interface SSOProviderFormDrawerProps {
  form: SSOProviderFormApi;
  setupUrls: SSOProviderSetupUrls;
}

export const SSOProviderFormDrawer = ({ form, setupUrls }: SSOProviderFormDrawerProps) => {
  const { t } = useTranslations({ en, de });
  const {
    isOpen,
    setOpen,
    editingProvider,
    formValues,
    setFormValues,
    isSamlProvider,
    isMutationPending,
    isSaveDisabled,
    handleSelectChange,
    handleSubmit,
    copyValue,
  } = form;

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
      <div data-cy="sso-provider-form-modal" className="contents">
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{editingProvider ? t('editProvider') : t('createNewProvider')}</h2>
        </DrawerHeader>
        <DrawerBody>
          <div className="flex flex-col gap-8" data-cy="sso-provider-form">
            <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
              <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
                {t('sections.provider')}
              </h3>
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
                  data-cy="sso-provider-form-type-select"
                />
              </div>
            </section>

            {formValues.type === SSOProviderType.OIDC && <OIDCConfigForm form={form} />}

            {formValues.type === SSOProviderType.SAML && <SAMLConfigForm form={form} />}

            <SetupInstructionsSection isSamlProvider={isSamlProvider} setupUrls={setupUrls} onCopy={copyValue} />
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onPress={() => setOpen(false)} data-cy="sso-provider-form-cancel-button">
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
        </DrawerFooter>
      </div>
    </StandardDrawer>
  );
};
