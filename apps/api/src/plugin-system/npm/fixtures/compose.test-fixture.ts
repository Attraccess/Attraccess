import { NpmPluginService } from '../../npm-plugin.service';
import { NpmInstallation } from '../installation';
import { NpmInstallationPlan } from '../installation-plan';
import { NpmPackageCatalog } from '../package-catalog';
import { NpmPackagePreparation } from '../package-preparation';
import { NpmPluginState } from '../plugin-state';
import { NpmRegistryAccess } from '../registry-access';

/** The collaborators an NpmPluginService composes, for tests that stub the one owning a step. */
export function npmInternals(service: NpmPluginService) {
  const installation = Reflect.get(service, 'installation') as NpmInstallation;
  return {
    state: Reflect.get(service, 'state') as NpmPluginState,
    registry: Reflect.get(service, 'registries') as NpmRegistryAccess,
    catalog: Reflect.get(service, 'catalog') as NpmPackageCatalog,
    plan: Reflect.get(service, 'plan') as NpmInstallationPlan,
    preparation: Reflect.get(installation, 'preparation') as NpmPackagePreparation,
    installation,
  };
}
