import type { LookupAddress } from 'dns';
import { lookup } from 'dns/promises';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as tar from 'tar';
import { NpmPluginAuditState } from './npm-plugin.service';
import { PluginService } from './plugin.service';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

const lookupAll = lookup as unknown as jest.MockedFunction<
  (host: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]>
>;

function auditState(): NpmPluginAuditState {
  return {
    packageName: '@attraccess/plugin',
    requestedSpec: '1.2.3',
    integrityResult: 'not-checked',
    provenanceResult: 'not-verified',
    migrationOutcome: 'not-run',
    activationOutcome: 'not-attempted',
    restartRequested: 0,
    rollbackOutcome: 'not-needed',
  };
}

export type ServiceInternals = {
  download(url: string): Promise<Buffer>;
  hostVersion(): string;
  removeBackup(backup: string): Promise<void>;
  writeState(installed: unknown): Promise<void>;
};

export type SettingsMock = {
  getPlainSetting: jest.Mock;
  getSecretSetting: jest.Mock;
  setPlainSetting: jest.Mock;
  setSecretSetting: jest.Mock;
};

async function packageTarball(name: string, permissions: string[] = []): Promise<Buffer> {
  const root = mkdtempSync(join(tmpdir(), 'npm-plugin-package-'));
  try {
    mkdirSync(join(root, 'package', 'dist'), { recursive: true });
    writeFileSync(
      join(root, 'package', 'package.json'),
      JSON.stringify({
        name,
        version: '1.2.3',
        keywords: ['attraccess-plugin'],
        peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
        attraccess: {
          displayName: name,
          host: '*',
          backend: 'dist/index.js',
          permissions,
          sdk: { backend: '*' },
        },
      }),
    );
    writeFileSync(join(root, 'package', 'dist', 'index.js'), 'module.exports = {};');

    const archive = tar.c({ cwd: root, gzip: true }, ['package']);
    const chunks: Buffer[] = [];
    for await (const chunk of archive) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
export function registerNpmPluginServiceFixture() {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'npm-plugin-service-'));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    jest.spyOn(PluginService.prototype, 'requestRestart').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    get lookupAll() {
      return lookupAll;
    },
    get auditState() {
      return auditState;
    },
    get packageTarball() {
      return packageTarball;
    },
    get root() {
      return root;
    },
  };
}
