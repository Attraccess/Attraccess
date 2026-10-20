import { DataSource } from 'typeorm';
import { SSOProvider, SSOProviderOIDCConfiguration, SSOProviderType, User } from '@attraccess/database-entities';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:https';
import { request as proxyRequest } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SettingsService } from '../../settings/settings.service';
import { SessionService } from '../../users-and-auth/auth/session.service';

const run = promisify(execFile);
export function registerHttpsBrowser(get: () => { app: NestExpressApplication; base: string }) {
  const browserTest = process.env.ATT_SECURITY_BROWSER_QA === '1' ? it : it.skip;
  browserTest(
    'rejects sibling HTTPS fetches, forms and uncorrelated logout navigation with real cookies',
    async () => {
      const { app, base } = get();
      const directory = mkdtempSync(join(tmpdir(), 'attraccess-https-'));
      await run('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=app.attraccess.test',
        '-keyout',
        join(directory, 'key'),
        '-out',
        join(directory, 'cert'),
        '-days',
        '1',
      ]);
      const requests: { method: string; path: string; origin?: string; cookie: boolean; status?: number }[] = [];
      const server = createServer(
        { key: readFileSync(join(directory, 'key')), cert: readFileSync(join(directory, 'cert')) },
        (req, res) => {
          if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><title>Controlled security test</title><body>Controlled security test</body>');
            return;
          }
          const receipt = {
            method: req.method,
            path: req.url,
            origin: req.headers.origin,
            cookie: Boolean(req.headers.cookie),
            status: undefined as number | undefined,
          };
          requests.push(receipt);
          const proxy = proxyRequest(
            new URL(req.url, base),
            { method: req.method, headers: req.headers },
            (upstream) => {
              receipt.status = upstream.statusCode;
              res.writeHead(upstream.statusCode, upstream.headers);
              upstream.pipe(res);
            },
          );
          proxy.on('error', () => {
            res.statusCode = 502;
            res.end();
          });
          req.pipe(proxy);
        },
      );
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      const allowed = `https://app.attraccess.test:${port}`,
        hostile = `https://help.attraccess.test:${port}`;
      const session = `att-1149-https-${process.pid}`;
      const browser = async (...args: string[]) =>
        (await run('agent-browser', ['--session', session, ...args], { timeout: 30000, maxBuffer: 1000000 })).stdout;
      const settings = app.get(SettingsService);
      try {
        await settings.updateAppSettings({ url: allowed });
        await browser(
          '--headed',
          'false',
          ...(existsSync('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser')
            ? ['--executable-path', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
            : []),
          '--ignore-https-errors',
          '--args',
          '--host-resolver-rules=MAP *.attraccess.test 127.0.0.1,--no-proxy-server',
          'open',
          allowed,
        );
        const login = await browser(
          'eval',
          `(async () => { const r = await fetch('/api/auth/session/local', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'enrollment-admin',password:'local-test-password',tokenLocation:'cookie'})}); return {status:r.status, cache:r.headers.get('cache-control'), body:await r.json()}; })()`,
        );
        expect(login).toContain('201');
        expect(login).toContain('no-store');
        const cookies = await browser('--json', 'cookies', 'get');
        const parsed = JSON.parse(cookies);
        const cookie = (parsed.data?.cookies ?? parsed.cookies ?? parsed).find(
          (item: { name: string }) => item.name === 'auth-session',
        );
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.secure).toBe(true);
        const token = cookie.value;
        expect(await app.get(SessionService).validateSession(token)).toBeTruthy();
        await browser('open', hostile);
        const attack = await browser(
          'eval',
          `(async () => { const target = ${JSON.stringify(allowed)}; const results = []; for (const headers of [{'Content-Type':'application/json'}, {'Content-Type':'application/x-www-form-urlencoded'}]) { try { const r = await fetch(target+'/api/auth/session/refresh', {method:'POST',credentials:'include',headers,body:headers['Content-Type']==='application/json'?'{}':'tokenLocation=body'}); results.push({status:r.status,body:await r.text()}); } catch { results.push('blocked'); } } const f=document.createElement('form'); f.method='POST'; f.action=target+'/api/auth/session/refresh'; f.target='attack'; document.body.append(Object.assign(document.createElement('iframe'),{name:'attack'}),f); f.submit(); return results; })()`,
        );
        expect(attack).not.toContain(token);
        await browser('wait', '500');
        await browser('open', `${allowed}/api/auth/sso/OIDC/999/frontchannel-logout`);
        expect(await app.get(SessionService).validateSession(token)).toBeTruthy();
        expect(requests.some((r) => r.method === 'OPTIONS' && r.origin === hostile && r.status === 403)).toBe(true);
        expect(requests.some((r) => r.method === 'POST' && r.origin === hostile && r.cookie && r.status === 403)).toBe(
          true,
        );
        await browser('open', allowed);
        const control = await browser(
          'eval',
          `(async () => { const r=await fetch('/api/auth/session/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()}; })()`,
        );
        expect(control).toContain('201');
        expect(control).toContain('no-store');
        expect(await app.get(SessionService).validateSession(token)).toBeNull();
        // Exercise logout against an actual company session. A local session or an
        // unknown provider would be a false-positive control for this regression.
        const db = app.get(DataSource);
        const provider = await db
          .getRepository(SSOProvider)
          .save({ name: 'Browser logout fixture', type: SSOProviderType.OIDC });
        const issuer = 'https://idp.example.test';
        await db
          .getRepository(SSOProviderOIDCConfiguration)
          .save({
            ssoProviderId: provider.id,
            issuer,
            authorizationURL: issuer + '/auth',
            tokenURL: issuer + '/token',
            userInfoURL: issuer + '/user',
            clientId: 'fixture',
            clientSecret: 'fixture',
          });
        const user = await db.getRepository(User).findOneByOrFail({ username: 'enrollment-admin' });
        const companyToken = await app
          .get(SessionService)
          .createSession(user, {
            ssoContext: {
              protocol: 'OIDC',
              providerId: provider.id,
              issuer,
              subject: 'person',
              sid: 'browser-session',
            },
          });
        await browser(
          'cookies',
          'set',
          'auth-session',
          companyToken,
          '--url',
          allowed,
          '--httpOnly',
          '--secure',
          '--sameSite',
          'Strict',
        );
        await browser('open', hostile);
        await browser('open', `${allowed}/api/auth/sso/OIDC/${provider.id}/frontchannel-logout`);
        expect(await app.get(SessionService).validateSession(companyToken)).toBeTruthy();
        await browser(
          'open',
          `${allowed}/api/auth/sso/OIDC/${provider.id}/frontchannel-logout?iss=${encodeURIComponent(issuer)}&sid=browser-session`,
        );
        expect(await app.get(SessionService).validateSession(companyToken)).toBeNull();
      } finally {
        await browser('close').catch(() => undefined);
        await settings.updateAppSettings({ url: 'http://allowed.example' });
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(directory, { recursive: true, force: true });
      }
    },
    120000,
  );
}
