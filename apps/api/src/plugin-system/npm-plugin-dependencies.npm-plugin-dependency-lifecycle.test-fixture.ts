import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as tar from 'tar';
import { NpmPluginService } from './npm-plugin.service';
import { PluginDependency } from './plugin-dependencies';
import { PluginService } from './plugin.service';

function pkg(name: string, dependencies: PluginDependency[] = [], version = '1.0.0') {
  return {
    name,
    version,
    keywords: ['attraccess-plugin'],
    peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
    attraccess: {
      displayName: name === 'core' ? '3D Printer Core' : name,
      host: '*',
      backend: 'dist/index.js',
      sdk: { backend: '*' },
      permissions: ['READ_USERS'],
      dependencies,
    },
  };
}

const dep = (name: string, version = '^1.0.0') => ({ name, version, required: true });

type Internals = {
  hostVersion(): string;
  download(url: string): Promise<Buffer>;
  writeRecords(records: unknown[]): Promise<void>;
};

async function archive(value: ReturnType<typeof pkg>) {
  const root = mkdtempSync(join(tmpdir(), 'plugin-graph-package-'));
  try {
    mkdirSync(join(root, 'package', 'dist'), { recursive: true });
    writeFileSync(join(root, 'package', 'package.json'), JSON.stringify(value));
    writeFileSync(join(root, 'package', 'dist', 'index.js'), 'module.exports = {};');
    const chunks: Buffer[] = [];
    for await (const chunk of tar.c({ cwd: root, gzip: true }, ['package'])) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
export function registerNpmPluginDependencyLifecycleFixture() {
  let root: string;

  let service: NpmPluginService;

  let internals: Internals;

  let metadata: Record<string, { versions: Record<string, unknown> }>;

  let archives: Map<string, Buffer>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-graph-'));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    jest.spyOn(PluginService.prototype, 'requestRestart').mockImplementation(() => undefined);
    service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    internals = service as unknown as Internals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    metadata = {};
    archives = new Map();
    jest.spyOn(service, 'packageMetadata').mockImplementation(async (name) => metadata[name] ?? { versions: {} });
    jest.spyOn(internals, 'download').mockImplementation(async (url) => {
      if (!archives.has(url)) throw new Error('download failed');
      return archives.get(url);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const publish = async (value: ReturnType<typeof pkg>) => {
    const buffer = await archive(value);
    const url = `${value.name}/${value.version}`;
    archives.set(url, buffer);
    metadata[value.name] ??= { versions: {} };
    metadata[value.name].versions[value.version] = {
      ...value,
      dist: { tarball: url, integrity: `sha512-${createHash('sha512').update(buffer).digest('base64')}` },
    };
  };

  const install = async (name: string) => {
    const plan = await service.installPlan(name, '1.0.0');
    return service.install(name, '1.0.0', undefined, undefined, plan.token);
  };
  return {
    get pkg() {
      return pkg;
    },
    get dep() {
      return dep;
    },
    get archive() {
      return archive;
    },
    get root() {
      return root;
    },
    get service() {
      return service;
    },
    get internals() {
      return internals;
    },
    get metadata() {
      return metadata;
    },
    get archives() {
      return archives;
    },
    get publish() {
      return publish;
    },
    get install() {
      return install;
    },
  };
}
