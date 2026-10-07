import { CC100_DIGITAL_PROFILE_ID } from '../shared/hardware-profile';
import {
  ConflictException
} from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { RuntimeDeliveryBundle } from "./wago-commissioning.service.runtime-delivery-bundle";
import { WagoCommissioningServiceRequireRuntimeArtifactOperation } from "./wago-commissioning.service.wago-commissioning-service-require-runtime-artifact-operation";
export abstract class WagoCommissioningServiceAcquireRuntimeBundleOperation extends WagoCommissioningServiceRequireRuntimeArtifactOperation {


  protected async acquireRuntimeBundle(session: WagoCommissioningSession): Promise<RuntimeDeliveryBundle> {
    await this.requireRuntimeArtifact();
    if (!this.artifacts) throw new ConflictException('Bundled CC100 runtime is unavailable.');
    const acquired = await this.artifacts.acquire();
    const bundle = {
      ...acquired,
      hardwareProfile: 'manifest' in acquired ? acquired.manifest.hardware.profile : CC100_DIGITAL_PROFILE_ID,
    };
    try {
      if (session.runtimeArtifactDigest !== bundle.digest) {
        session.runtimeArtifactDigest = bundle.digest;
        await this.save(session, 'runtime_release_resolved');
      }
      return bundle;
    } catch (error) {
      await rm(bundle.directory, { recursive: true, force: true });
      throw error;
    }
  }
}
