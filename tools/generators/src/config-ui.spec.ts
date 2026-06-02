import * as fs from 'fs';
import * as path from 'path';
import { ROOT, extractServiceBlock, fileExists, readFile } from './compose-test-utils';

describe('config-ui', () => {
  describe('Dockerfile', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('tools/config-ui/Dockerfile');
    });

    it('should exist', () => {
      expect(fileExists('tools/config-ui/Dockerfile')).toBe(true);
    });

    it('should use a node alpine base image', () => {
      expect(content).toMatch(/FROM\s+node:\S+-alpine/);
    });

    it('should COPY entrypoint.sh and make it executable', () => {
      expect(content).toMatch(/COPY\s+entrypoint\.sh\b/);
      expect(content).toMatch(/chmod\s+\+x\s+.*entrypoint\.sh/);
    });

    it('should COPY server.js, modules/, and public/index.html', () => {
      expect(content).toMatch(/COPY\s+server\.js\b/);
      expect(content).toMatch(/COPY\s+modules\//);
      expect(content).toMatch(/COPY\s+public\/index\.html\b/);
    });

    it('should EXPOSE admin UI port 5380', () => {
      expect(content).toMatch(/EXPOSE\s+5380/);
    });

    it('should create /data and /etc/prometheus', () => {
      expect(content).toMatch(/mkdir[^\n]*\/data\b/);
      expect(content).toMatch(/mkdir[^\n]*\/etc\/prometheus\b/);
    });

    it('should set ENTRYPOINT to entrypoint.sh', () => {
      expect(content).toMatch(/ENTRYPOINT\s+\[.*entrypoint\.sh.*\]/);
    });
  });

  describe('docker-compose.yml', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('docker-compose.yml');
    });

    it('should define a config-ui service', () => {
      expect(content).toMatch(/^\s{2}config-ui:/m);
    });

    it('should build config-ui from ./tools/config-ui', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).toContain('context: ./tools/config-ui');
      expect(section).toContain('dockerfile: Dockerfile');
    });

    it('should use restart: unless-stopped', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).toContain('restart: unless-stopped');
    });

    it('should expose admin UI port 5380', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).toMatch(/expose:[\s\S]*?5380/);
    });

    it('should mount config-ui-data:/data', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).toMatch(/config-ui-data:\/data/);
    });

    it('should share prometheus-config with prometheus', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).toContain('prometheus-config:/etc/prometheus');
    });

    it('should load .env.docker-compose', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).toContain('.env.docker-compose');
    });

    it('should declare config-ui-data and prometheus-config volumes', () => {
      const volumesSection = content.slice(content.lastIndexOf('\nvolumes:'));
      expect(volumesSection).toContain('config-ui-data:');
      expect(volumesSection).toContain('prometheus-config:');
    });

    it('should include config-ui-data in duplicati backup volumes', () => {
      const duplicatiSection = extractServiceBlock(content, 'duplicati');
      expect(duplicatiSection).toContain('config-ui-data:/external-storage/config-ui');
    });

    it('should define a prometheus service that depends_on config-ui', () => {
      const section = extractServiceBlock(content, 'prometheus');
      expect(section).toMatch(/depends_on:[\s\S]*?config-ui:/);
      expect(section).toContain('prometheus-config:/etc/prometheus:ro');
    });

    it('should define a grafana service mounting monitoring/grafana provisioning', () => {
      const section = extractServiceBlock(content, 'grafana');
      expect(section).toContain('grafana-provisioning:/etc/grafana/provisioning:ro');
      expect(section).toContain('grafana-dashboards:/var/lib/grafana/dashboards:ro');
    });
  });

  describe('services.docker-compose.yml', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('services.docker-compose.yml');
    });

    it('should define a config-ui service bound to 127.0.0.1:5380', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).toContain('127.0.0.1:5380:5380');
    });

    it('should require CONFIG_UI_USERNAME and CONFIG_UI_PASSWORD env vars', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).toContain('CONFIG_UI_USERNAME');
      expect(section).toContain('CONFIG_UI_PASSWORD');
    });
  });

  describe('cross-file consistency', () => {
    it('CONFIG_UI_PASSWORD is required by server.js (refuses to start when empty)', () => {
      const server = readFile('tools/config-ui/server.js');
      expect(server).toContain('CONFIG_UI_PASSWORD');
      expect(server).toMatch(/refus.*start|process\.exit\(1\)/i);
    });

    it('admin UI port in docker-compose matches server.js default', () => {
      const compose = readFile('docker-compose.yml');
      const server = readFile('tools/config-ui/server.js');
      const composeSection = extractServiceBlock(compose, 'config-ui');
      expect(composeSection).toContain('5380');
      expect(server).toContain('5380');
    });

  });

  describe('security', () => {
    it('server.js uses crypto.timingSafeEqual for basic-auth comparison', () => {
      const server = readFile('tools/config-ui/server.js');
      expect(server).toContain('crypto.timingSafeEqual');
    });

    it('server.js enforces a maximum request body size', () => {
      const server = readFile('tools/config-ui/server.js');
      expect(server).toContain('MAX_BODY_SIZE');
      expect(server).toContain('body too large');
    });

    it('admin UI escapes user-provided content to prevent XSS', () => {
      const html = readFile('tools/config-ui/public/index.html');
      expect(html).toMatch(/escapeHtml|textContent|innerText/);
    });

    it('prometheus module sanitizes YAML values', () => {
      const mod = readFile('tools/config-ui/modules/prometheus.js');
      expect(mod).toContain('sanitizeYamlValue');
    });

  });

  describe('file structure', () => {
    it('tools/config-ui/ directory should exist', () => {
      const dirPath = path.join(ROOT, 'tools/config-ui');
      expect(fs.existsSync(dirPath)).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    });

    it('should contain the expected top-level files', () => {
      [
        'Dockerfile',
        'entrypoint.sh',
        'server.js',
        'public/index.html',
        'modules/prometheus.js',
      ].forEach((f) => {
        expect(fileExists(`tools/config-ui/${f}`)).toBe(true);
      });
    });

    it('should not contain a package.json or node_modules', () => {
      expect(fileExists('tools/config-ui/package.json')).toBe(false);
      expect(fileExists('tools/config-ui/package-lock.json')).toBe(false);
      expect(fileExists('tools/config-ui/node_modules')).toBe(false);
    });
  });

  describe('orphaned dns-server tool has been removed', () => {
    it('tools/dns-server/ directory should no longer exist', () => {
      expect(fileExists('tools/dns-server')).toBe(false);
    });

    it('docker-compose.yml should not reference the removed dns-server service', () => {
      const compose = readFile('docker-compose.yml');
      expect(compose).not.toMatch(/^\s{2}dns-server:\s*$/m);
      expect(compose).not.toContain('dns-server-data');
      expect(compose).not.toContain('./tools/dns-server');
    });
  });
});
