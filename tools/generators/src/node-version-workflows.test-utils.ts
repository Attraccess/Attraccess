export function registerDockerWorkflowCases(readFile: (path: string) => string) {
  describe('GitHub Actions Docker builds read Node.js version from .nvmrc', () => {
    describe('docker-build-push composite action', () => {
      let content: string;

      beforeAll(() => {
        content = readFile('.github/actions/docker-build-push/action.yml');
      });

      it('should read NODE_VERSION from .nvmrc', () => {
        expect(content).toContain('cat .nvmrc');
      });

      it('should pass NODE_VERSION as a Docker build-arg', () => {
        expect(content).toContain('NODE_VERSION=${{ steps.node-version.outputs.value }}');
      });

      it('should not hardcode a Node.js version in build-args', () => {
        const buildArgLines = content
          .split('\n')
          .filter((l) => l.includes('NODE_VERSION=') && !l.includes('${{') && !l.includes('cat .nvmrc'));
        const hardcodedVersionArgs = buildArgLines.filter((l) => /NODE_VERSION=\d+/.test(l));
        expect(hardcodedVersionArgs).toHaveLength(0);
      });
    });

    const workflowsWithDocker = ['docker-nightly-latest.yml', 'pull-requests.yml', 'release.yml'];

    workflowsWithDocker.forEach((workflowFile) => {
      describe(workflowFile, () => {
        let content: string;

        beforeAll(() => {
          content = readFile(`.github/workflows/${workflowFile}`);
        });

        it('should build Docker images via the docker-build-push action', () => {
          expect(content).toContain('./.github/actions/docker-build-push');
        });

        it('should not hardcode a Node.js version in build-args', () => {
          const buildArgLines = content
            .split('\n')
            .filter((l) => l.includes('NODE_VERSION=') && !l.includes('${{') && !l.includes('cat .nvmrc'));
          const hardcodedVersionArgs = buildArgLines.filter((l) => /NODE_VERSION=\d+/.test(l));
          expect(hardcodedVersionArgs).toHaveLength(0);
        });
      });
    });
  });
}
