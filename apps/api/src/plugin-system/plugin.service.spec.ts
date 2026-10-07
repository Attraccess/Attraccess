import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';
import { registerDiscoveryCases } from './plugin.service.plugin-service.discovery.test-cases';
import { registerGetManifestByIdToManifestInfoCases } from './plugin.service.plugin-service.delete-plugin.behaviors.test-cases';
import { registerUploadPluginCases } from './plugin.service.plugin-service.upload-plugin.test-cases';
import { registerDeletePluginCases } from './plugin.service.plugin-service.delete-plugin.behaviors.test-cases';
import { registerRestartAppCases } from './plugin.service.plugin-service.delete-plugin.behaviors.test-cases';
describe('PluginService', () => {
  const fixture = registerPluginServiceFixture();
  registerDiscoveryCases(fixture);
  registerGetManifestByIdToManifestInfoCases(fixture);
  registerUploadPluginCases(fixture);
  registerDeletePluginCases(fixture);
  registerRestartAppCases(fixture);
});
