import { useCallback } from 'react';
import { CreateSSOProviderDto, SSOProviderType } from '@attraccess/react-query-client';
import { ensureOidcConfiguration, ensureSamlConfiguration } from './formDefaults';
import { SSO_PROVIDERS_LIST_PATH } from './useSSOProviderForm.sso-providers-list-path';
import type { useSSOProviderFormEffects } from './useSSOProviderFormEffects';

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
