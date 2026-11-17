import { useWagoTranslations } from '../i18n';
import runtimeMessages from '../managed-runtime.en.json';

/** Translates runtime update failure codes and backend messages for the managed-runtime panels. */
export function useRuntimeFailureMessages() {
  const { t, tBackendMessage } = useWagoTranslations();
  const failureMessage = (failure: string) =>
    t(`runtimeManagement.failures.${Object.hasOwn(runtimeMessages.failures, failure) ? failure : 'unknown'}`);
  const errorMessage = (message: string) => {
    const failure = /^CC100 runtime update failed: ([a-z_]+)\./.exec(message);
    return failure ? failureMessage(failure[1]) : tBackendMessage(message);
  };
  return { failureMessage, errorMessage };
}
