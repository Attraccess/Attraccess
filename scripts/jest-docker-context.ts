import { execFileSync } from 'node:child_process';

// Testcontainers does not read Docker CLI contexts. Export the active context's
// endpoint so it works with Docker Desktop and alternatives such as OrbStack.
if (!process.env['DOCKER_HOST']) {
  try {
    const dockerHost = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();

    if (dockerHost) {
      process.env['DOCKER_HOST'] = dockerHost;
    }
  } catch {
    // Individual container tests retain responsibility for reporting an unavailable Docker daemon.
  }
}
