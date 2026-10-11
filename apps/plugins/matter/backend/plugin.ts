import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk';
import { ReleaseTuple, SUPPORTED_RELEASE } from '@attraccess/matter-contract';

class MatterPluginModule {}
const plugin: PluginBackendModule = {
  register() {
    // Bundle runtime validation and policy into the installable artifact.
    ReleaseTuple.parse(SUPPORTED_RELEASE);
    return { module: MatterPluginModule, controllers: [], providers: [] };
  },
};
export const supportedRelease = SUPPORTED_RELEASE;
export default plugin;
