import { SSO_PROVIDERS_LIST_PATH } from './useSSOProviderForm.sso-providers-list-path';
import { useSSOProviderFormInputs } from './useSSOProviderFormInputs';
import { useSSOProviderFormEffects } from './useSSOProviderFormEffects';
import { useSSOProviderFormCopyValue } from './useSSOProviderFormCopyValue';
import { useSSOProviderFormHandleSubmit } from './useSSOProviderFormHandleSubmit';
import { useSSOProviderFormOutput } from './useSSOProviderFormOutput';

export function useSSOProviderForm(providerId?: number) {
  const useSSOProviderFormInputsModel = useSSOProviderFormInputs(providerId);
  const useSSOProviderFormEffectsModel = useSSOProviderFormEffects(useSSOProviderFormInputsModel);
  const useSSOProviderFormCopyValueModel = useSSOProviderFormCopyValue(useSSOProviderFormEffectsModel);
  const useSSOProviderFormHandleSubmitModel = useSSOProviderFormHandleSubmit(useSSOProviderFormCopyValueModel);
  return useSSOProviderFormOutput(useSSOProviderFormHandleSubmitModel);
}

export type SSOProviderFormApi = ReturnType<typeof useSSOProviderForm>;

export { SSO_PROVIDERS_LIST_PATH };
