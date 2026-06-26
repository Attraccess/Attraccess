/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');

const EXPECTED_NODE_MAJOR = 24;

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8').trim();
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFile(relativePath));
}

function extractMajor(version: string): number {
  const match = version.match(/^v?(\d+)/);
  if (!match) throw new Error(`Cannot parse major version from "${version}"`);
  return parseInt(match[1], 10);
}

describe('Node.js version consistency', () => {
  let nvmrcVersion: string;

  beforeAll(() => {
    nvmrcVersion = readFile('.nvmrc');
  });

  describe('.nvmrc', () => {
    it('should exist and contain a valid semver version', () => {
      expect(nvmrcVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it(`should specify Node.js ${EXPECTED_NODE_MAJOR}.x`, () => {
      expect(extractMajor(nvmrcVersion)).toBe(EXPECTED_NODE_MAJOR);
    });
  });

  describe('root Dockerfile', () => {
    let dockerfileContent: string;

    beforeAll(() => {
      dockerfileContent = readFile('Dockerfile');
    });

    it('should set NODE_VERSION ARG matching .nvmrc', () => {
      const match = dockerfileContent.match(/ARG\s+NODE_VERSION=(\S+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(nvmrcVersion);
    });

    it('should use NODE_VERSION in builder stage FROM', () => {
      expect(dockerfileContent).toContain(
        'FROM node:${NODE_VERSION}-${NODE_VERSION_NAME} AS builder'
      );
    });

    it('should use NODE_VERSION in final stage FROM', () => {
      const fromLines = dockerfileContent
        .split('\n')
        .filter((l) => l.startsWith('FROM node:'));
      expect(fromLines.length).toBeGreaterThanOrEqual(2);
      fromLines.forEach((line) => {
        expect(line).toContain('${NODE_VERSION}');
      });
    });

    it('should not hardcode any other Node.js version', () => {
      const lines = dockerfileContent.split('\n');
      const hardcoded = lines.filter(
        (l) =>
          /node:\d+\.\d+/.test(l) && !l.includes('${NODE_VERSION}')
      );
      expect(hardcoded).toHaveLength(0);
    });
  });

  describe('hetzner-dns-updater Dockerfile', () => {
    let dockerfileContent: string;

    beforeAll(() => {
      dockerfileContent = readFile('tools/hetzner-dns-updater/Dockerfile');
    });

    it('should use a FROM image with the same Node.js version as .nvmrc', () => {
      const match = dockerfileContent.match(/FROM\s+node:(\S+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toContain(nvmrcVersion);
    });

    it(`should reference Node ${EXPECTED_NODE_MAJOR}+ in comments`, () => {
      expect(dockerfileContent).toContain(`Node ${EXPECTED_NODE_MAJOR}+`);
    });

    it('should not reference an older Node.js major version in comments', () => {
      const olderMajorRefs = dockerfileContent.match(
        /Node\s+(1[0-9]|2[0-3])\+/g
      );
      expect(olderMajorRefs).toBeNull();
    });
  });

  describe('config-ui Dockerfile', () => {
    let dockerfileContent: string;

    beforeAll(() => {
      dockerfileContent = readFile('tools/config-ui/Dockerfile');
    });

    it('should use a FROM image with the same Node.js version as .nvmrc', () => {
      const match = dockerfileContent.match(/FROM\s+node:(\S+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toContain(nvmrcVersion);
    });

    it('should not reference an older Node.js major version', () => {
      const olderMajorRefs = dockerfileContent.match(
        /node:(18|20|22)\.\d+\.\d+/gi
      );
      expect(olderMajorRefs).toBeNull();
    });
  });

  describe('package.json engines', () => {
    let engines: { node?: string; pnpm?: string };

    beforeAll(() => {
      const pkg = readJson('package.json') as {
        engines?: { node?: string; pnpm?: string };
      };
      engines = pkg.engines!;
    });

    it('should define an engines.node field', () => {
      expect(engines).toBeDefined();
      expect(engines.node).toBeDefined();
    });

    it(`should require Node.js >= ${EXPECTED_NODE_MAJOR}.0.0`, () => {
      const nodeEngine = engines.node as string;
      const match = nodeEngine.match(/>=\s*(\d+)/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBe(EXPECTED_NODE_MAJOR);
    });

    it('engines.node major should match .nvmrc major', () => {
      const nodeEngine = engines.node as string;
      const versionMatch = nodeEngine.match(/(\d+)/);
      expect(versionMatch).not.toBeNull();
      const enginesMajor = parseInt(versionMatch![1], 10);
      expect(enginesMajor).toBe(extractMajor(nvmrcVersion));
    });

    it('should define an engines.pnpm field', () => {
      expect(engines.pnpm).toBeDefined();
    });
  });

  describe('GitHub Actions setup action', () => {
    let actionContent: string;

    beforeAll(() => {
      actionContent = readFile('.github/actions/setup/action.yml');
    });

    it('should use node-version-file pointing to .nvmrc', () => {
      expect(actionContent).toContain("node-version-file: '.nvmrc'");
    });

    it('should not hardcode a node-version value', () => {
      const lines = actionContent.split('\n');
      const hardcodedVersion = lines.filter(
        (l) =>
          /node-version:\s*['"]?\d+/.test(l) &&
          !l.includes('node-version-file')
      );
      expect(hardcodedVersion).toHaveLength(0);
    });
  });

  describe('GitHub Actions workflows read Node.js version from .nvmrc', () => {
    // Workflows that handle Docker build inline (not via the shared action)
    const workflowsWithInlineDocker = ['docker-nightly-latest.yml'];

    // Workflows that delegate to the shared docker-build-push composite action,
    // which internally reads .nvmrc and passes NODE_VERSION as a build-arg
    const workflowsUsingDockerAction = ['pull-requests.yml', 'release.yml'];

    const dockerBuildPushAction = readFile(
      '.github/actions/docker-build-push/action.yml'
    );

    describe('.github/actions/docker-build-push/action.yml', () => {
      it('should read NODE_VERSION from .nvmrc', () => {
        expect(dockerBuildPushAction).toContain('cat .nvmrc');
      });

      it('should pass NODE_VERSION as a Docker build-arg', () => {
        expect(dockerBuildPushAction).toContain('NODE_VERSION=');
      });
    });

    workflowsWithInlineDocker.forEach((workflowFile) => {
      describe(workflowFile, () => {
        let content: string;

        beforeAll(() => {
          content = readFile(`.github/workflows/${workflowFile}`);
        });

        it('should read NODE_VERSION from .nvmrc', () => {
          expect(content).toContain('cat .nvmrc');
        });

        it('should not hardcode a Node.js version in build-args', () => {
          const buildArgLines = content
            .split('\n')
            .filter(
              (l) =>
                l.includes('NODE_VERSION=') &&
                !l.includes('${{') &&
                !l.includes('cat .nvmrc')
            );
          const hardcodedVersionArgs = buildArgLines.filter((l) =>
            /NODE_VERSION=\d+/.test(l)
          );
          expect(hardcodedVersionArgs).toHaveLength(0);
        });
      });
    });

    workflowsUsingDockerAction.forEach((workflowFile) => {
      describe(workflowFile, () => {
        let content: string;

        beforeAll(() => {
          content = readFile(`.github/workflows/${workflowFile}`);
        });

        it('should use the docker-build-push composite action for Docker builds', () => {
          expect(content).toContain('.github/actions/docker-build-push');
        });

        it('should not hardcode a Node.js version in build-args', () => {
          const buildArgLines = content
            .split('\n')
            .filter(
              (l) =>
                l.includes('NODE_VERSION=') &&
                !l.includes('${{') &&
                !l.includes('cat .nvmrc')
            );
          const hardcodedVersionArgs = buildArgLines.filter((l) =>
            /NODE_VERSION=\d+/.test(l)
          );
          expect(hardcodedVersionArgs).toHaveLength(0);
        });
      });
    });
  });

  describe('no stale Node.js version references', () => {
    const filesToCheck = [
      'Dockerfile',
      'tools/hetzner-dns-updater/Dockerfile',
      'tools/config-ui/Dockerfile',
      '.github/actions/setup/action.yml',
      '.github/workflows/pull-requests.yml',
      '.github/workflows/release.yml',
      '.github/workflows/docker-nightly-latest.yml',
    ];

    filesToCheck.forEach((filePath) => {
      it(`${filePath} should not reference Node.js 18.x or 20.x or 22.x`, () => {
        const content = readFile(filePath);
        const staleRefs = content.match(
          /node:(18|20|22)\.\d+\.\d+/gi
        );
        expect(staleRefs).toBeNull();
      });
    });
  });

  describe('all pinned versions are consistent with .nvmrc', () => {
    it('root Dockerfile default NODE_VERSION matches .nvmrc exactly', () => {
      const dockerfile = readFile('Dockerfile');
      const match = dockerfile.match(/ARG\s+NODE_VERSION=(\S+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(nvmrcVersion);
    });

    it('hetzner Dockerfile FROM version matches .nvmrc exactly', () => {
      const dockerfile = readFile('tools/hetzner-dns-updater/Dockerfile');
      const match = dockerfile.match(/FROM\s+node:([^\s-]+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(nvmrcVersion);
    });

    it('config-ui Dockerfile FROM version matches .nvmrc exactly', () => {
      const dockerfile = readFile('tools/config-ui/Dockerfile');
      const match = dockerfile.match(/FROM\s+node:([^\s-]+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(nvmrcVersion);
    });

    it('package.json engines.node major matches .nvmrc major', () => {
      const pkg = readJson('package.json') as {
        engines: { node: string };
      };
      const versionMatch = pkg.engines.node.match(/(\d+)/);
      expect(versionMatch).not.toBeNull();
      const enginesMajor = parseInt(versionMatch![1], 10);
      expect(enginesMajor).toBe(extractMajor(nvmrcVersion));
    });
  });
});
