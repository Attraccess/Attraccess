import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { SettingsService } from '../../../../settings/settings.service';
import { OidcCookieStateStore } from './oidc-cookie-state-store';

jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReqRes(cookies: Record<string, string> = {}): { req: Request; res: Response } {
  const res = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;

  const req = {
    cookies,
    res,
  } as unknown as Request;

  return { req, res };
}

function buildModule(urlOverride?: string | null, secretOverride = 'test-secret') {
  return Test.createTestingModule({
    providers: [
      OidcCookieStateStore,
      {
        provide: SettingsService,
        useValue: {
          getUrl: jest.fn().mockResolvedValue(urlOverride === undefined ? 'http://localhost:3000' : urlOverride),
        },
      },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn().mockReturnValue({ AUTH_SESSION_SECRET: secretOverride }),
        },
      },
    ],
  }).compile();
}

/** Round-trip helper: calls store() then captures the cookie value, then calls verify(). */
async function storeAndCaptureCookieValue(
  store: OidcCookieStateStore,
  ctx: { nonce?: string; maxAge?: number; issued?: Date } = {},
  appState: unknown = null,
): Promise<{ handle: string; cookieValue: string; res: Response }> {
  const { req, res } = makeReqRes();

  const handle = await new Promise<string>((resolve, reject) => {
    store.store(req, ctx, appState, {}, (err, h) => {
      if (err) reject(err);
      else resolve(h);
    });
  });

  // The value set on the cookie
  const cookieValue = (res.cookie as jest.Mock).mock.calls[0][1] as string;

  return { handle, cookieValue, res };
}
export function registerOidcCookieStateStoreFixture() {
  let store: OidcCookieStateStore;

  let settingsService: jest.Mocked<Pick<SettingsService, 'getUrl'>>;

  let module: TestingModule;

  beforeEach(async () => {
    module = await buildModule('http://localhost:3000');
    store = module.get(OidcCookieStateStore);
    settingsService = module.get(SettingsService);
  });
  return {
    get makeReqRes() {
      return makeReqRes;
    },
    get buildModule() {
      return buildModule;
    },
    get storeAndCaptureCookieValue() {
      return storeAndCaptureCookieValue;
    },
    get store() {
      return store;
    },
    get settingsService() {
      return settingsService;
    },
  };
}
