import { SUPPORTED_RELEASE, MATTER_JS_RELEASE, INITIAL_CAPABILITIES } from '@attraccess/matter-contract';
import { createApplication } from './application.js';
import { matterPlatform } from './platform.js';

declare const BUILD_REVISION: string;
declare const BUILD_VERSION: string;
let app: ReturnType<typeof createApplication> | undefined;
let exiting = false;
async function stop(exitCode: number) {
  if (exiting) return;
  exiting = true;
  const hardExit = setTimeout(() => process.exit(exitCode), app?.config.shutdownMs ?? 5000);
  try {
    await app?.shutdown();
  } finally {
    clearTimeout(hardExit);
    process.exit(exitCode);
  }
}
process.on('SIGTERM', () => {
  void stop(0);
});
process.on('SIGINT', () => {
  void stop(0);
});
process.on('uncaughtException', () => {
  process.stderr.write('Matter sidecar encountered a fatal runtime error. Restart and inspect configuration.\n');
  void stop(1);
});
process.on('unhandledRejection', () => {
  process.stderr.write('Matter sidecar encountered a fatal asynchronous error. Restart and inspect configuration.\n');
  void stop(1);
});
try {
  app = createApplication({
    config: {
      host: process.env.MATTER_HOST as '127.0.0.1' | '::1' | undefined,
      port: process.env.MATTER_PORT === undefined ? undefined : Number(process.env.MATTER_PORT),
    },
    platform: matterPlatform(),
    version: {
      schemaVersion: 1,
      build: { version: BUILD_VERSION, revision: BUILD_REVISION },
      sidecarRelease: BUILD_VERSION,
      matterJsRelease: MATTER_JS_RELEASE,
      storageSchemaVersion: 1,
      wireProtocolVersion: 1,
      supportedReleases: [SUPPORTED_RELEASE],
      capabilities: INITIAL_CAPABILITIES,
    },
  });
  const address = await app.start();
  process.stdout.write(`Matter sidecar ready at ${address.url}; no fabric initialized.\n`);
} catch {
  process.stderr.write(
    'Matter sidecar initialization failed. Verify loopback MATTER_HOST, MATTER_PORT, Node >=24 and pinned matter.js dependencies.\n',
  );
  await stop(1);
}
