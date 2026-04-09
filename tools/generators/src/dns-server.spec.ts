/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8').trim();
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

describe('dns-server', () => {
  // ---------------------------------------------------------------------------
  // Group 1: Dockerfile
  // ---------------------------------------------------------------------------
  describe('Dockerfile', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('tools/dns-server/Dockerfile');
    });

    it('should exist', () => {
      expect(fileExists('tools/dns-server/Dockerfile')).toBe(true);
    });

    it('should use a node alpine base image', () => {
      expect(content).toMatch(/FROM\s+node:\S+-alpine/);
    });

    it('should use the same Node.js version as .nvmrc', () => {
      const nvmrc = readFile('.nvmrc');
      const match = content.match(/FROM\s+node:(\S+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toContain(nvmrc);
    });

    it('should install dnsmasq via apk', () => {
      expect(content).toMatch(/apk\s+add\b.*\bdnsmasq\b/);
    });

    it('should not install dnsmasq with cache (--no-cache)', () => {
      expect(content).toMatch(/apk\s+add\s+--no-cache\b.*\bdnsmasq\b/);
    });

    it('should COPY entrypoint.sh', () => {
      expect(content).toMatch(/COPY\s+entrypoint\.sh\b/);
    });

    it('should make entrypoint.sh executable', () => {
      expect(content).toMatch(/chmod\s+\+x\s+.*entrypoint\.sh/);
    });

    it('should COPY server.js', () => {
      expect(content).toMatch(/COPY\s+server\.js\b/);
    });

    it('should COPY public/index.html', () => {
      expect(content).toMatch(/COPY\s+public\/index\.html\b/);
    });

    it('should EXPOSE port 53/udp', () => {
      expect(content).toMatch(/EXPOSE\s+53\/udp/);
    });

    it('should EXPOSE port 53/tcp', () => {
      expect(content).toMatch(/EXPOSE\s+53\/tcp/);
    });

    it('should EXPOSE port 5380 for admin UI', () => {
      expect(content).toMatch(/EXPOSE\s+5380/);
    });

    it('should set ENTRYPOINT to entrypoint.sh', () => {
      expect(content).toMatch(/ENTRYPOINT\s+\[.*entrypoint\.sh.*\]/);
    });

    it('should create /data directory for persistent storage', () => {
      expect(content).toMatch(/mkdir.*\/data/);
    });

    it('should create /etc/dnsmasq.d directory', () => {
      expect(content).toMatch(/mkdir.*\/etc\/dnsmasq\.d/);
    });

    it('should not hardcode a different Node.js major version than .nvmrc', () => {
      const nvmrc = readFile('.nvmrc');
      const nvmrcMajor = nvmrc.match(/^(\d+)/)?.[1];
      const fromMatch = content.match(/FROM\s+node:(\d+)/);
      expect(fromMatch).not.toBeNull();
      expect(fromMatch![1]).toBe(nvmrcMajor);
    });

    it('should not reference stale Node.js versions (18/20/22)', () => {
      const staleRefs = content.match(/node:(18|20|22)\.\d+\.\d+/gi);
      expect(staleRefs).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 2: entrypoint.sh
  // ---------------------------------------------------------------------------
  describe('entrypoint.sh', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('tools/dns-server/entrypoint.sh');
    });

    it('should exist', () => {
      expect(fileExists('tools/dns-server/entrypoint.sh')).toBe(true);
    });

    it('should start with a shebang line', () => {
      expect(content).toMatch(/^#!\/bin\/sh/);
    });

    it('should use set -e for fail-fast behavior', () => {
      expect(content).toContain('set -e');
    });

    it('should check the DNS_SERVER_ENABLED env var', () => {
      expect(content).toContain('DNS_SERVER_ENABLED');
    });

    it('should default to disabled (FALSE)', () => {
      expect(content).toMatch(/DNS_SERVER_ENABLED:-\s*FALSE/i);
    });

    it('should accept TRUE as enabled', () => {
      expect(content).toContain('TRUE');
    });

    it('should accept 1 as enabled', () => {
      expect(content).toMatch(/"1"/);
    });

    it('should accept YES as enabled', () => {
      expect(content).toContain('YES');
    });

    it('should sleep-loop when disabled (Balena keep-alive pattern)', () => {
      expect(content).toContain('while true');
      expect(content).toContain('sleep');
    });

    it('should log a disabled message when not enabled', () => {
      expect(content).toMatch(/echo.*disabled/i);
    });

    it('should start the node server when enabled', () => {
      expect(content).toMatch(/node\s+.*server\.js/);
    });

    it('should use exec for proper PID 1 signal handling', () => {
      expect(content).toMatch(/exec\s+node/);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 3: server.js
  // ---------------------------------------------------------------------------
  describe('server.js', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('tools/dns-server/server.js');
    });

    it('should exist', () => {
      expect(fileExists('tools/dns-server/server.js')).toBe(true);
    });

    it('should use strict mode', () => {
      expect(content).toContain("'use strict'");
    });

    // --- dnsmasq process management ---

    it('should spawn dnsmasq as a child process', () => {
      expect(content).toMatch(/spawn\(.*dnsmasq/);
    });

    it('should run dnsmasq with --no-daemon flag', () => {
      expect(content).toContain('--no-daemon');
    });

    it('should use --conf-dir=/etc/dnsmasq.d', () => {
      expect(content).toContain('--conf-dir=/etc/dnsmasq.d');
    });

    it('should send SIGHUP to reload dnsmasq config', () => {
      expect(content).toContain('SIGHUP');
    });

    it('should handle dnsmasq process exit', () => {
      expect(content).toMatch(/on\(\s*['"]exit['"]/);
    });

    // --- Data persistence ---

    it('should store records in /data/records.json', () => {
      expect(content).toContain('records.json');
    });

    it('should store settings in /data/settings.json', () => {
      expect(content).toContain('settings.json');
    });

    it('should use /data as the data directory', () => {
      expect(content).toMatch(/['"]\/data['"]/);
    });

    it('should load records from disk on startup', () => {
      expect(content).toMatch(/loadRecords/);
    });

    it('should save records to disk on changes', () => {
      expect(content).toMatch(/saveRecords/);
    });

    // --- dnsmasq config generation ---

    it('should use addn-hosts for DNS records (reloadable via SIGHUP)', () => {
      expect(content).toContain('addn-hosts');
    });

    it('should generate hosts file with IP-hostname format', () => {
      expect(content).toMatch(/record\.ip.*record\.hostname|ip.*hostname/);
    });

    it('should set no-resolv to avoid reading /etc/resolv.conf', () => {
      expect(content).toContain('no-resolv');
    });

    it('should configure upstream DNS servers with server= directive', () => {
      expect(content).toMatch(/server=\$/);
    });

    it('should support log-queries option', () => {
      expect(content).toContain('log-queries');
    });

    it('should support local domain configuration', () => {
      expect(content).toMatch(/local=\//);
      expect(content).toMatch(/domain=/);
    });

    it('should write config to /etc/dnsmasq.d/', () => {
      expect(content).toContain('/etc/dnsmasq.d');
    });

    // --- REST API routes ---

    it('should serve the admin UI on GET /', () => {
      expect(content).toContain("method === 'GET'");
      expect(content).toContain("pathname === '/'");
    });

    it('should implement GET /api/records', () => {
      expect(content).toContain('/api/records');
    });

    it('should implement POST /api/records', () => {
      expect(content).toContain("'POST'");
      expect(content).toContain('/api/records');
    });

    it('should implement PUT /api/records/:id', () => {
      expect(content).toContain("'PUT'");
      expect(content).toContain('records');
    });

    it('should implement DELETE /api/records/:id', () => {
      expect(content).toContain("'DELETE'");
      expect(content).toContain('records');
    });

    it('should implement GET /api/settings', () => {
      expect(content).toContain('/api/settings');
    });

    it('should implement PUT /api/settings', () => {
      expect(content).toContain("'PUT'");
      expect(content).toContain('/api/settings');
    });

    it('should implement GET /api/status', () => {
      expect(content).toContain('/api/status');
    });

    it('should return 404 for unknown routes', () => {
      expect(content).toMatch(/404.*not\s*found/i);
    });

    it('should return 400 when hostname or ip is missing on POST', () => {
      expect(content).toContain('400');
      expect(content).toContain('hostname and ip required');
    });

    it('should return 404 when record is not found on PUT/DELETE', () => {
      expect(content).toMatch(/404.*record not found/i);
    });

    it('should generate unique IDs for new records using crypto', () => {
      expect(content).toMatch(/crypto\.randomUUID/);
    });

    // --- Authentication ---

    it('should reference DNS_ADMIN_PASSWORD env var', () => {
      expect(content).toContain('DNS_ADMIN_PASSWORD');
    });

    it('should reference DNS_ADMIN_USERNAME env var', () => {
      expect(content).toContain('DNS_ADMIN_USERNAME');
    });

    it('should default username to admin', () => {
      expect(content).toMatch(/DNS_ADMIN_USERNAME.*['"]admin['"]/);
    });

    it('should skip auth when password is empty', () => {
      expect(content).toContain('!password');
      expect(content).toContain('return true');
    });

    it('should check Authorization header for Basic auth', () => {
      expect(content).toMatch(/authorization/i);
      expect(content).toContain('Basic ');
    });

    it('should return 401 with WWW-Authenticate header when auth fails', () => {
      expect(content).toContain('401');
      expect(content).toContain('WWW-Authenticate');
    });

    it('should decode base64 credentials', () => {
      expect(content).toContain('base64');
    });

    it('should use timing-safe comparison for auth credentials', () => {
      expect(content).toContain('timingSafeEqual');
    });

    // --- Request body limits ---

    it('should enforce a maximum body size limit', () => {
      expect(content).toContain('MAX_BODY_SIZE');
    });

    it('should reject bodies exceeding the size limit', () => {
      expect(content).toContain('body too large');
    });

    // --- Environment variables ---

    it('should reference DNS_UPSTREAM_1 env var', () => {
      expect(content).toContain('DNS_UPSTREAM_1');
    });

    it('should reference DNS_UPSTREAM_2 env var', () => {
      expect(content).toContain('DNS_UPSTREAM_2');
    });

    it('should default upstream1 to 1.1.1.1', () => {
      expect(content).toContain('1.1.1.1');
    });

    it('should default upstream2 to 8.8.8.8', () => {
      expect(content).toContain('8.8.8.8');
    });

    it('should reference DNS_LOCAL_DOMAIN env var', () => {
      expect(content).toContain('DNS_LOCAL_DOMAIN');
    });

    it('should reference DNS_LOG_QUERIES env var', () => {
      expect(content).toContain('DNS_LOG_QUERIES');
    });

    // --- HTTP server setup ---

    it('should listen on port 5380 by default', () => {
      expect(content).toContain('5380');
    });

    it('should bind to 0.0.0.0', () => {
      expect(content).toContain('0.0.0.0');
    });

    it('should use http.createServer (Node built-in)', () => {
      expect(content).toMatch(/http\.createServer/);
    });

    it('should serve index.html from public directory', () => {
      expect(content).toMatch(/public.*index\.html|index\.html.*public/);
    });

    it('should set Content-Type to application/json for API responses', () => {
      expect(content).toContain('application/json');
    });

    it('should set Content-Type to text/html for the admin UI', () => {
      expect(content).toContain('text/html');
    });

    // --- Graceful shutdown ---

    it('should handle SIGTERM for graceful shutdown', () => {
      expect(content).toContain('SIGTERM');
    });

    it('should handle SIGINT for graceful shutdown', () => {
      expect(content).toContain('SIGINT');
    });

    it('should kill dnsmasq on shutdown', () => {
      expect(content).toContain('dnsmasqProcess');
      expect(content).toContain(".kill('SIGTERM')");
    });

    it('should close the HTTP server on shutdown', () => {
      expect(content).toMatch(/server\.close/);
    });

    // --- Zero-dependency pattern ---

    it('should only require Node built-in modules', () => {
      const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
      const modules = requireMatches.map((m) => {
        const match = m.match(/require\(['"]([^'"]+)['"]\)/);
        return match ? match[1] : '';
      });
      const builtins = ['http', 'fs', 'path', 'child_process', 'crypto', 'os', 'url', 'util', 'stream', 'events', 'net', 'dns', 'tls', 'zlib', 'querystring'];
      modules.forEach((mod) => {
        expect(builtins).toContain(mod);
      });
    });

    it('should not have a package.json (zero-dep pattern)', () => {
      expect(fileExists('tools/dns-server/package.json')).toBe(false);
    });

    it('should not have a node_modules directory', () => {
      expect(fileExists('tools/dns-server/node_modules')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 4: Admin UI (public/index.html)
  // ---------------------------------------------------------------------------
  describe('admin UI (public/index.html)', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('tools/dns-server/public/index.html');
    });

    it('should exist', () => {
      expect(fileExists('tools/dns-server/public/index.html')).toBe(true);
    });

    it('should be a valid HTML document with DOCTYPE', () => {
      expect(content).toMatch(/<!DOCTYPE html>/i);
    });

    it('should include a html lang attribute', () => {
      expect(content).toMatch(/<html\s+lang=/);
    });

    it('should set charset to UTF-8', () => {
      expect(content).toMatch(/charset=["']?UTF-8/i);
    });

    it('should include a viewport meta tag for responsive design', () => {
      expect(content).toContain('viewport');
      expect(content).toContain('width=device-width');
    });

    it('should have a title containing DNS', () => {
      expect(content).toMatch(/<title>.*DNS.*<\/title>/i);
    });

    // --- Record management UI ---

    it('should have an input field for hostname', () => {
      expect(content).toMatch(/id=["']new-hostname["']/);
    });

    it('should have an input field for IP address', () => {
      expect(content).toMatch(/id=["']new-ip["']/);
    });

    it('should have an add record button', () => {
      expect(content).toMatch(/addRecord/);
    });

    it('should have a records table with hostname and IP columns', () => {
      expect(content).toMatch(/<th>.*Hostname.*<\/th>/i);
      expect(content).toMatch(/<th>.*IP\s*Address.*<\/th>/i);
    });

    it('should have edit functionality for records', () => {
      expect(content).toMatch(/startEdit|editRecord/);
    });

    it('should have save edit functionality', () => {
      expect(content).toMatch(/saveEdit/);
    });

    it('should have cancel edit functionality', () => {
      expect(content).toMatch(/cancelEdit/);
    });

    it('should have delete functionality for records', () => {
      expect(content).toMatch(/deleteRecord/);
    });

    it('should show a confirmation before deleting', () => {
      expect(content).toContain('confirm(');
    });

    it('should have an empty state message', () => {
      expect(content).toMatch(/empty-state|no.*records/i);
    });

    // --- Settings UI ---

    it('should have an input for upstream DNS 1', () => {
      expect(content).toMatch(/id=["']upstream1["']/);
    });

    it('should have an input for upstream DNS 2', () => {
      expect(content).toMatch(/id=["']upstream2["']/);
    });

    it('should have an input for local domain', () => {
      expect(content).toMatch(/id=["']localDomain["']/);
    });

    it('should have a checkbox for log queries', () => {
      expect(content).toMatch(/id=["']logQueries["']/);
      expect(content).toMatch(/type=["']checkbox["']/);
    });

    it('should have a save settings button', () => {
      expect(content).toMatch(/saveSettings/);
    });

    // --- API integration ---

    it('should call GET /api/records', () => {
      expect(content).toContain('/api/records');
    });

    it('should call GET /api/settings', () => {
      expect(content).toContain('/api/settings');
    });

    it('should call GET /api/status', () => {
      expect(content).toContain('/api/status');
    });

    it('should use fetch for API calls', () => {
      expect(content).toContain('fetch(');
    });

    it('should send JSON content type for POST/PUT requests', () => {
      expect(content).toContain('application/json');
    });

    it('should use POST method for creating records', () => {
      expect(content).toContain("'POST'");
    });

    it('should use PUT method for updating records/settings', () => {
      expect(content).toContain("'PUT'");
    });

    it('should use DELETE method for deleting records', () => {
      expect(content).toContain("'DELETE'");
    });

    // --- Status display ---

    it('should show dnsmasq status', () => {
      expect(content).toMatch(/status/i);
      expect(content).toMatch(/running|stopped/i);
    });

    it('should periodically check dnsmasq status', () => {
      expect(content).toContain('setInterval');
      expect(content).toContain('checkStatus');
    });

    // --- Styling and responsiveness ---

    it('should include embedded CSS styles', () => {
      expect(content).toMatch(/<style>/);
    });

    it('should have responsive media queries', () => {
      expect(content).toMatch(/@media/);
    });

    // --- Test IDs for automated testing ---

    it('should have data-testid on hostname input', () => {
      expect(content).toContain('data-testid="input-hostname"');
    });

    it('should have data-testid on IP input', () => {
      expect(content).toContain('data-testid="input-ip"');
    });

    it('should have data-testid on add record button', () => {
      expect(content).toContain('data-testid="btn-add-record"');
    });

    it('should have data-testid on edit record button', () => {
      expect(content).toContain('data-testid="btn-edit-record"');
    });

    it('should have data-testid on delete record button', () => {
      expect(content).toContain('data-testid="btn-delete-record"');
    });

    it('should have data-testid on save settings button', () => {
      expect(content).toContain('data-testid="btn-save-settings"');
    });

    it('should have data-testid on upstream DNS inputs', () => {
      expect(content).toContain('data-testid="input-upstream1"');
      expect(content).toContain('data-testid="input-upstream2"');
    });

    it('should have data-testid on local domain input', () => {
      expect(content).toContain('data-testid="input-local-domain"');
    });

    it('should have data-testid on log queries checkbox', () => {
      expect(content).toContain('data-testid="input-log-queries"');
    });

    // --- XSS protection ---

    it('should escape HTML in rendered content', () => {
      expect(content).toMatch(/escapeHtml|textContent/);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 5: docker-compose.yml dns-server service
  // ---------------------------------------------------------------------------
  describe('docker-compose.yml', () => {
    let content: string;
    let lines: string[];

    beforeAll(() => {
      content = readFile('docker-compose.yml');
      lines = content.split('\n');
    });

    it('should define a dns-server service', () => {
      expect(content).toMatch(/^\s{2}dns-server:/m);
    });

    it('should build dns-server from ./tools/dns-server', () => {
      expect(content).toContain('context: ./tools/dns-server');
    });

    it('should reference the Dockerfile', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      expect(dnsSection).toContain('dockerfile: Dockerfile');
    });

    it('should use restart: unless-stopped', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      expect(dnsSection).toContain('restart: unless-stopped');
    });

    it('should expose port 53 UDP for DNS', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      expect(dnsSection).toContain('53/udp');
    });

    it('should expose port 53 TCP for DNS', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      expect(dnsSection).toContain('53/tcp');
    });

    it('should expose port 5380 for admin UI', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      expect(dnsSection).toContain('5380');
    });

    it('should use env_file referencing .env.docker-compose', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      expect(dnsSection).toContain('.env.docker-compose');
    });

    it('should mount dns-server-data volume to /data', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      expect(dnsSection).toMatch(/dns-server-data:\/data/);
    });

    it('should use network_mode: host', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      expect(dnsSection).toContain('network_mode: host');
    });

    it('should define dns-server-data in the volumes section', () => {
      const volumesSection = content.slice(content.lastIndexOf('\nvolumes:'));
      expect(volumesSection).toContain('dns-server-data:');
    });

    it('should not use the same port as any other service for port 53', () => {
      const otherServices = lines.filter(
        (l) => l.match(/['"]53:/) && !isInServiceBlock(content, l, 'dns-server')
      );
      expect(otherServices).toHaveLength(0);
    });

    it('should not use port 5380 in any other service', () => {
      const dnsSection = extractServiceBlock(content, 'dns-server');
      const otherContent = content.replace(dnsSection, '');
      expect(otherContent).not.toContain('5380');
    });

    // --- Duplicati backup integration ---

    it('should include dns-server-data in duplicati backup volumes', () => {
      const duplicatiSection = extractServiceBlock(content, 'duplicati');
      expect(duplicatiSection).toContain('dns-server-data:/external-storage/dns-server');
    });
  });

  // ---------------------------------------------------------------------------
  // Group 6: .env.docker-compose DNS variables
  // ---------------------------------------------------------------------------
  describe('.env.docker-compose', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('.env.docker-compose');
    });

    it('should have a DNS Server section header', () => {
      expect(content).toMatch(/#\s*DNS\s*Server/i);
    });

    it('should define DNS_SERVER_ENABLED', () => {
      expect(content).toMatch(/^DNS_SERVER_ENABLED=/m);
    });

    it('should default DNS_SERVER_ENABLED to FALSE', () => {
      expect(content).toMatch(/^DNS_SERVER_ENABLED=FALSE$/m);
    });

    it('should define DNS_UPSTREAM_1', () => {
      expect(content).toMatch(/^DNS_UPSTREAM_1=/m);
    });

    it('should default DNS_UPSTREAM_1 to 1.1.1.1', () => {
      expect(content).toMatch(/^DNS_UPSTREAM_1=1\.1\.1\.1$/m);
    });

    it('should define DNS_UPSTREAM_2', () => {
      expect(content).toMatch(/^DNS_UPSTREAM_2=/m);
    });

    it('should default DNS_UPSTREAM_2 to 8.8.8.8', () => {
      expect(content).toMatch(/^DNS_UPSTREAM_2=8\.8\.8\.8$/m);
    });

    it('should define DNS_LOCAL_DOMAIN', () => {
      expect(content).toMatch(/^DNS_LOCAL_DOMAIN=/m);
    });

    it('should default DNS_LOCAL_DOMAIN to empty', () => {
      expect(content).toMatch(/^DNS_LOCAL_DOMAIN=$/m);
    });

    it('should define DNS_LOG_QUERIES', () => {
      expect(content).toMatch(/^DNS_LOG_QUERIES=/m);
    });

    it('should default DNS_LOG_QUERIES to FALSE', () => {
      expect(content).toMatch(/^DNS_LOG_QUERIES=FALSE$/m);
    });

    it('should define DNS_ADMIN_USERNAME', () => {
      expect(content).toMatch(/^DNS_ADMIN_USERNAME=/m);
    });

    it('should default DNS_ADMIN_USERNAME to admin', () => {
      expect(content).toMatch(/^DNS_ADMIN_USERNAME=admin$/m);
    });

    it('should define DNS_ADMIN_PASSWORD', () => {
      expect(content).toMatch(/^DNS_ADMIN_PASSWORD=/m);
    });

    it('should default DNS_ADMIN_PASSWORD to empty (no auth)', () => {
      expect(content).toMatch(/^DNS_ADMIN_PASSWORD=$/m);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 7: Cross-file consistency
  // ---------------------------------------------------------------------------
  describe('cross-file consistency', () => {
    it('should reference all DNS_* env vars from .env.docker-compose in server.js or entrypoint.sh', () => {
      const envContent = readFile('.env.docker-compose');
      const serverContent = readFile('tools/dns-server/server.js');
      const entrypointContent = readFile('tools/dns-server/entrypoint.sh');
      const combined = serverContent + '\n' + entrypointContent;

      const dnsVars = envContent
        .split('\n')
        .filter((l) => /^DNS_[A-Z_]+=/.test(l))
        .map((l) => l.split('=')[0]);

      expect(dnsVars.length).toBeGreaterThan(0);
      dnsVars.forEach((varName) => {
        expect(combined).toContain(varName);
      });
    });

    it('should have matching Node.js version between dns-server Dockerfile and .nvmrc', () => {
      const nvmrc = readFile('.nvmrc');
      const dockerfile = readFile('tools/dns-server/Dockerfile');
      const match = dockerfile.match(/FROM\s+node:([^\s-]+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(nvmrc);
    });

    it('should not have any DNS service port conflicts in docker-compose.yml', () => {
      const compose = readFile('docker-compose.yml');
      const portMatches = compose.match(/'(\d+):(\d+)(?:\/\w+)?'/g) || [];
      const hostPorts = portMatches.map((m) => {
        const match = m.match(/'(\d+):/);
        return match ? match[1] : '';
      });
      const port53Occurrences = hostPorts.filter((p) => p === '53');
      expect(port53Occurrences.length).toBeLessThanOrEqual(2);
    });

    it('should reference all files COPYed in Dockerfile', () => {
      const dockerfile = readFile('tools/dns-server/Dockerfile');
      const copyMatches = dockerfile.match(/COPY\s+(\S+)/g) || [];
      const copiedFiles = copyMatches
        .map((m) => m.replace(/^COPY\s+/, ''))
        .filter((f) => !f.startsWith('--'));

      copiedFiles.forEach((f) => {
        const fullPath = f.startsWith('/')
          ? f
          : `tools/dns-server/${f}`;
        expect(fileExists(fullPath)).toBe(true);
      });
    });

    it('should have the dns-server Dockerfile in the node-version-consistency filesToCheck', () => {
      const consistencySpec = readFile(
        'tools/generators/src/node-version-consistency.spec.ts'
      );
      expect(consistencySpec).toContain('tools/dns-server/Dockerfile');
    });

    it('should have a dns-server describe block in node-version-consistency spec', () => {
      const consistencySpec = readFile(
        'tools/generators/src/node-version-consistency.spec.ts'
      );
      expect(consistencySpec).toMatch(/describe\(.*dns-server\s+Dockerfile/i);
    });

    it('admin UI port in docker-compose should match server.js default', () => {
      const compose = readFile('docker-compose.yml');
      const server = readFile('tools/dns-server/server.js');
      expect(compose).toContain('5380');
      expect(server).toContain('5380');
    });

    it('should have consistent data volume path between docker-compose and server.js', () => {
      const compose = readFile('docker-compose.yml');
      const server = readFile('tools/dns-server/server.js');
      expect(compose).toContain('dns-server-data:/data');
      expect(server).toContain('/data');
    });
  });

  // ---------------------------------------------------------------------------
  // Group 8: Security
  // ---------------------------------------------------------------------------
  describe('security', () => {
    it('admin UI should escape user-provided content to prevent XSS', () => {
      const html = readFile('tools/dns-server/public/index.html');
      expect(html).toMatch(/escapeHtml|textContent|innerText/);
    });

    it('server.js should validate required fields on POST', () => {
      const server = readFile('tools/dns-server/server.js');
      expect(server).toMatch(/!body\.hostname\s*\|\|\s*!body\.ip/);
    });

    it('server.js should return proper HTTP status codes', () => {
      const server = readFile('tools/dns-server/server.js');
      expect(server).toContain('200');
      expect(server).toContain('201');
      expect(server).toContain('400');
      expect(server).toContain('401');
      expect(server).toContain('404');
      expect(server).toContain('500');
    });

    it('server.js should handle malformed JSON body gracefully', () => {
      const server = readFile('tools/dns-server/server.js');
      expect(server).toMatch(/catch|error/i);
    });

    it('auth should use crypto.timingSafeEqual for constant-time comparison', () => {
      const server = readFile('tools/dns-server/server.js');
      expect(server).toContain('crypto.timingSafeEqual');
    });

    it('server.js should enforce maximum request body size', () => {
      const server = readFile('tools/dns-server/server.js');
      expect(server).toContain('MAX_BODY_SIZE');
      expect(server).toContain('body too large');
    });

    it('Dockerfile should document why root is required', () => {
      const dockerfile = readFile('tools/dns-server/Dockerfile');
      expect(dockerfile).toMatch(/root.*required|privileged.*port/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Group 9: File structure
  // ---------------------------------------------------------------------------
  describe('file structure', () => {
    it('tools/dns-server/ directory should exist', () => {
      const dirPath = path.join(ROOT, 'tools/dns-server');
      expect(fs.existsSync(dirPath)).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    });

    it('tools/dns-server/public/ directory should exist', () => {
      const dirPath = path.join(ROOT, 'tools/dns-server/public');
      expect(fs.existsSync(dirPath)).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    });

    it('should contain exactly the expected files (no unexpected files)', () => {
      const dirPath = path.join(ROOT, 'tools/dns-server');
      const allFiles = getAllFiles(dirPath, dirPath);
      const expected = [
        'Dockerfile',
        'entrypoint.sh',
        'server.js',
        'public/index.html',
      ];
      expected.forEach((f) => {
        expect(allFiles).toContain(f);
      });
    });

    it('should not contain a package.json', () => {
      expect(fileExists('tools/dns-server/package.json')).toBe(false);
    });

    it('should not contain a package-lock.json', () => {
      expect(fileExists('tools/dns-server/package-lock.json')).toBe(false);
    });

    it('should not contain a tsconfig.json', () => {
      expect(fileExists('tools/dns-server/tsconfig.json')).toBe(false);
    });
  });
});

// =============================================================================
// Helper functions
// =============================================================================

function extractServiceBlock(compose: string, serviceName: string): string {
  const lines = compose.split('\n');
  const serviceRegex = new RegExp(`^\\s{2}${serviceName}:`);
  const startIdx = lines.findIndex((l) => serviceRegex.test(l));
  if (startIdx === -1) return '';

  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.match(/^\s{2}\S/) && !line.match(/^\s{4,}/)) break;
    if (line.match(/^volumes:/) || line.match(/^networks:/)) break;
    endIdx++;
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

function isInServiceBlock(
  compose: string,
  line: string,
  serviceName: string
): boolean {
  const block = extractServiceBlock(compose, serviceName);
  return block.includes(line.trim());
}

function getAllFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, baseDir));
    } else {
      results.push(path.relative(baseDir, fullPath));
    }
  }
  return results;
}
