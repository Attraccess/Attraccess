import { useCallback } from 'react';
import { CreateSSOProviderDto, SSOProviderType, UpdateSSOProviderDto } from '@attraccess/react-query-client';
import { SSO_PROVIDERS_LIST_PATH } from './useSSOProviderForm.sso-providers-list-path';
import { buildOidcPayload, buildSamlPayload } from './sso-provider-payload';
import type { useSSOProviderFormCopyValue } from './useSSOProviderFormCopyValue';

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
