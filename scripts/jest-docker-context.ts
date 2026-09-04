import { execFileSync } from 'node:child_process';

// Run once per container-backed Jest project so workers inherit the resolved host.
module.exports = function setDockerContext() {
  // Testcontainers does not read Docker CLI contexts. Export the active context's
  // endpoint so it works with Docker Desktop and alternatives such as OrbStack.
  if (process.env['DOCKER_HOST']) return;

  try {
    const dockerHost = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();

    if (dockerHost) process.env['DOCKER_HOST'] = dockerHost;
  } catch {
    // Individual container tests retain responsibility for reporting an unavailable Docker daemon.
  }
};
