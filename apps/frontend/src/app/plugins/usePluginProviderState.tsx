import { PropsWithChildren } from 'react';
import { usePluginProviderStateInputs } from './usePluginProviderStateInputs';
import { usePluginProviderStateLoadPlugin } from './usePluginProviderStateLoadPlugin';
import { usePluginProviderStateOutput } from './usePluginProviderStateOutput';

export function usePluginProviderState(props: PropsWithChildren) {
  const usePluginProviderStateInputsModel = usePluginProviderStateInputs(props);
  const usePluginProviderStateLoadPluginModel = usePluginProviderStateLoadPlugin(usePluginProviderStateInputsModel);
  return usePluginProviderStateOutput(usePluginProviderStateLoadPluginModel);
}
