import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createCommissioningHarness,
  sidecarSession,
  type CommissioningHarness,
} from '../testing/commissioning-harness.test-utils';
import { MatterCommissioningController } from './controller';

const CODE = '34970112332';
const KEYS = ['matter.devices.commission', 'matter.devices.manage'];
const as = (permissions: string[]) =>
  ({
    user: { id: 7, authenticationMethod: 'session', effectivePermissions: new Set(permissions) },
  }) as unknown as AuthenticatedRequest;

describe('the commissioning controller', () => {
  let h: CommissioningHarness;
  let controller: MatterCommissioningController;
  beforeEach(async () => {
    h = await createCommissioningHarness();
    controller = new MatterCommissioningController(h.commissioning, h.removal, h.sharing, h.lifecycle);
    h.connection.handlers['commissioning.start'] = () => sidecarSession({ attestationOverrideAllowed: true });
  });
  afterEach(() => h.close());

  it('guards every route with its key from the Matter permission map', () => {
    const source = readFileSync(join(__dirname, 'controller.ts'), 'utf8');
    expect(source.match(/@Auth\(\.\.\.MATTER_OPERATIONS\./g)).toHaveLength(
      source.match(/@(Get|Post|Patch|Delete)\(/g)?.length ?? -1,
    );
    expect(source).toContain("@Controller('matter')");
  });

  it('keeps the share answer, which carries the sharing codes, out of every cache', () => {
    expect(Reflect.getMetadata(HEADERS_METADATA, MatterCommissioningController.prototype.share)).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
  });

  it('validates strictly and never echoes the submitted code', async () => {
    for (const body of [{ setupCode: '123' }, { setupCode: CODE, extra: 1 }, { setupCode: 12345678901 }, {}]) {
      const error = await controller.start(body, as(KEYS)).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify((error as BadRequestException).getResponse())).not.toContain('123');
    }
    const odd = await controller.start({ setupCode: `${CODE}x` }, as(KEYS)).catch((failure: unknown) => failure);
    expect(JSON.stringify((odd as BadRequestException).getResponse())).not.toContain(CODE);
  });

  it('refuses a QR payload far longer than any real one, without echoing it', async () => {
    const junk = `MT:${'A'.repeat(513)}`;
    const error = await controller.start({ setupCode: junk }, as(KEYS)).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify((error as BadRequestException).getResponse())).not.toContain('AAAA');
  });

  it('starts a session for the commission key, and answers the caller’s own current session', async () => {
    const view = await controller.start({ setupCode: CODE }, as(['matter.devices.commission']));
    expect(view).toMatchObject({ state: 'pending', overrideAvailable: true });
    expect(controller.current(as(['matter.devices.commission']))).toMatchObject({ id: view.id });
    expect(controller.get(view.id, as([]))).toMatchObject({ id: view.id });
  });

  it('allows the override only with both the commission and the manage key, and only confirmed', async () => {
    const body = { setupCode: CODE, attestationOverride: { confirmed: true } };
    await expect(controller.start(body, as(['matter.devices.commission']))).rejects.toMatchObject({
      response: { code: 'attestation_override_forbidden' },
    });
    await expect(controller.start(body, as(['matter.devices.commission']))).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.connection.sent.some((entry) => entry.operation === 'commissioning.start')).toBe(false);
    await expect(
      controller.start({ setupCode: CODE, attestationOverride: { confirmed: false } }, as(KEYS)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.start(body, as(KEYS))).resolves.toMatchObject({ state: 'pending' });
  });

  it('answers null when the caller has no session, and validates the remove and share bodies', async () => {
    expect(controller.current(as(KEYS))).toBeNull();
    await expect(
      controller.remove('00000000-0000-4000-8000-000000000001', { mode: 'normal' }, as(KEYS)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.remove('00000000-0000-4000-8000-000000000001', { mode: 'normal', confirm: false }, as(KEYS)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.share('00000000-0000-4000-8000-000000000001', { timeoutSec: 60 }, as(KEYS)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(() => controller.get('not-a-uuid', as(KEYS))).toThrow(BadRequestException);
  });
});
