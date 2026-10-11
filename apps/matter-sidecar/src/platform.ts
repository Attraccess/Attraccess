import { MATTER_JS_RELEASE } from '@attraccess/matter-contract';
import type { Platform } from './application.js';

export function matterPlatform(): Platform {
  let dispose: (() => Promise<void>) | undefined;
  return {
    async initialize() {
      // Configure before importing the platform. No fabric, storage, radio or device is created.
      const { config } = await import('@matter/nodejs/config');
      config.loadProcessArgv = false;
      config.loadProcessEnv = false;
      config.loadConfigFile = false;
      config.defaultConfigFilePath = 'attraccess-foundation-unused.json';
      config.initializeStorage = false;
      config.installFilesystem = false;
      config.installNetwork = false;
      config.trapProcessSignals = false;
      config.trapUnhandledErrors = false;
      config.setProcessExitCodeOnError = false;
      await import('@matter/main/platform');
      const { Environment, Crypto, version } = await import('@matter/main');
      const { ProcessManager } = await import('@matter/nodejs');
      const env = Environment.default;
      dispose = async () => {
        await env.runtime.close();
        env.close(ProcessManager);
      };
      if (version !== MATTER_JS_RELEASE)
        throw new Error(
          `Loaded matter.js ${version}, expected ${MATTER_JS_RELEASE}; reinstall the pinned dependencies.`,
        );
      // Exercise the installed native crypto provider rather than just resolving an import.
      await env.get(Crypto).randomBytes(16);
    },
    async dispose() {
      await dispose?.();
    },
  };
}
