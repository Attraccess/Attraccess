import { extractServiceBlock, readFile } from './compose-test-utils';

describe('technitium dns service', () => {
  describe('docker-compose.yml', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('docker-compose.yml');
    });

    it('defines a dns service', () => {
      expect(content).toMatch(/^\s{2}dns:/m);
    });

    it('uses the technitium/dns-server image with a semver tag', () => {
      const section = extractServiceBlock(content, 'dns');
      expect(section).toMatch(
        /image:\s*technitium\/dns-server:\d+\.\d+\.\d+/,
      );
    });

    it('is gated by the dns profile', () => {
      const section = extractServiceBlock(content, 'dns');
      expect(section).toMatch(/profiles:\s*\[\s*['"]dns['"]\s*\]/);
    });

    it('publishes DNS ports 53 UDP and TCP', () => {
      const section = extractServiceBlock(content, 'dns');
      expect(section).toContain("'53:53/udp'");
      expect(section).toContain("'53:53/tcp'");
    });

    it('publishes web UI on host port 5381 mapped to container 5380', () => {
      const section = extractServiceBlock(content, 'dns');
      expect(section).toContain("'5381:5380'");
    });

    it('mounts dns-data:/etc/dns', () => {
      const section = extractServiceBlock(content, 'dns');
      expect(section).toContain('dns-data:/etc/dns');
    });

    it('requires DNS_SERVER_ADMIN_PASSWORD via :? compose interpolation', () => {
      const section = extractServiceBlock(content, 'dns');
      expect(section).toMatch(/DNS_SERVER_ADMIN_PASSWORD:\s*\$\{DNS_SERVER_ADMIN_PASSWORD:\?/);
    });

    it('uses restart: unless-stopped', () => {
      const section = extractServiceBlock(content, 'dns');
      expect(section).toContain('restart: unless-stopped');
    });

    it('loads .env.docker-compose', () => {
      const section = extractServiceBlock(content, 'dns');
      expect(section).toContain('.env.docker-compose');
    });

    it('declares dns-data in the top-level volumes block', () => {
      const volumesSection = content.slice(content.lastIndexOf('\nvolumes:'));
      expect(volumesSection).toContain('dns-data:');
    });

    it('includes dns-data in the duplicati backup volumes', () => {
      const duplicatiSection = extractServiceBlock(content, 'duplicati');
      expect(duplicatiSection).toContain('dns-data:/external-storage/dns');
    });

    it('removes port 53 publishes from config-ui', () => {
      const section = extractServiceBlock(content, 'config-ui');
      expect(section).not.toContain('53:53/udp');
      expect(section).not.toContain('53:53/tcp');
    });
  });

  describe('.env.docker-compose', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('.env.docker-compose');
    });

    it('declares DNS_SERVER_ADMIN_PASSWORD with an empty default', () => {
      expect(content).toMatch(/^DNS_SERVER_ADMIN_PASSWORD=\s*$/m);
    });

    it('declares DNS_SERVER_DOMAIN with a default value', () => {
      expect(content).toMatch(/^DNS_SERVER_DOMAIN=\S+/m);
    });

    it('removes legacy dnsmasq DNS_* env vars', () => {
      expect(content).not.toMatch(/^DNS_SERVER_ENABLED=/m);
      expect(content).not.toMatch(/^DNS_UPSTREAM_1=/m);
      expect(content).not.toMatch(/^DNS_UPSTREAM_2=/m);
      expect(content).not.toMatch(/^DNS_LOCAL_DOMAIN=/m);
      expect(content).not.toMatch(/^DNS_LOG_QUERIES=/m);
      expect(content).not.toMatch(/^DNS_LISTEN_ADDRESS=/m);
    });
  });

  describe('.env.example', () => {
    let content: string;

    beforeAll(() => {
      content = readFile('.env.example');
    });

    it('declares DNS_SERVER_ADMIN_PASSWORD', () => {
      expect(content).toMatch(/^DNS_SERVER_ADMIN_PASSWORD=/m);
    });

    it('removes legacy dnsmasq DNS_SERVER_ENABLED', () => {
      expect(content).not.toMatch(/^DNS_SERVER_ENABLED=/m);
    });
  });
});
