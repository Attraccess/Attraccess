import type { useSSOProviderFormHandleSubmit } from './useSSOProviderFormHandleSubmit';

export function useSSOProviderFormOutput(model: ReturnType<typeof useSSOProviderFormHandleSubmit>) {
  return {
    // mode
    isEditing: model.isEditing,
    isLoadingProvider: model.isLoadingProvider,
    // data
    providerDetails: model.providerDetails,
    // form state
    formValues: model.formValues,
    setFormValues: model.setFormValues,
    showClientSecret: model.showClientSecret,
    setShowClientSecret: model.setShowClientSecret,
    showSamlProvisioningSecret: model.showSamlProvisioningSecret,
    setShowSamlProvisioningSecret: model.setShowSamlProvisioningSecret,
    scopesInput: model.scopesInput,
    setScopesInput: model.setScopesInput,
    usernameClaimPathsInput: model.usernameClaimPathsInput,
    setUsernameClaimPathsInput: model.setUsernameClaimPathsInput,
    emailClaimPathsInput: model.emailClaimPathsInput,
    setEmailClaimPathsInput: model.setEmailClaimPathsInput,
    emailAttributeKeysInput: model.emailAttributeKeysInput,
    setEmailAttributeKeysInput: model.setEmailAttributeKeysInput,
    roles: model.roles,
    isLoadingRoles: model.isLoadingRoles,
    oidcRoleMappingEntries: model.oidcRoleMappingEntries,
    setOidcRoleMappingEntries: model.setOidcRoleMappingEntries,
    samlRoleMappingEntries: model.samlRoleMappingEntries,
    setSamlRoleMappingEntries: model.setSamlRoleMappingEntries,
    // derived
    isSamlProvider: model.isSamlProvider,
    isMutationPending: model.isMutationPending,
    isSaveDisabled: model.isSaveDisabled,
    // handlers
    onAutoDiscovery: model.onAutoDiscovery,
    setOidc: model.setOidc,
    setSaml: model.setSaml,
    copyValue: model.copyValue,
    handleSamlToggleChange: model.handleSamlToggleChange,
    handleSelectChange: model.handleSelectChange,
    handleCancel: model.handleCancel,
    handleSubmit: model.handleSubmit,
  };
}
