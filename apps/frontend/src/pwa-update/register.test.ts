import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPwaUpdates } from './register';

const mocks = vi.hoisted(() => ({
  registerSW: vi.fn(),
  start: vi.fn(() => ({ apply: vi.fn(), dispose: vi.fn() })),
  setApply: vi.fn(),
  installNet: vi.fn(),
}));

vi.mock('virtual:pwa-register', () => ({ registerSW: mocks.registerSW }));
vi.mock('./updateController', () => ({
  startPwaUpdateController: mocks.start,
  setPwaUpdateApply: mocks.setApply,
  installChunkLoadSafetyNet: mocks.installNet,
}));

describe('registerPwaUpdates', () => {
  const register = vi.fn();
  const getRegistration = vi.fn();

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    register.mockReset().mockResolvedValue({ scope: '/' });
    getRegistration.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', { value: { register, getRegistration }, configurable: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('registers directly in production, without the plugin that reloads the page on its own', async () => {
    vi.stubEnv('PROD', true);
    registerPwaUpdates();
    await vi.waitFor(() => expect(mocks.setApply).toHaveBeenCalled());
    expect(register).toHaveBeenCalledWith('/service-worker.js', { scope: '/', type: 'classic' });
    expect(mocks.registerSW).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledWith({ registration: { scope: '/' } });
    expect(mocks.installNet).toHaveBeenCalledOnce();
  });

  it('tracks an existing registration without waiting for register() to settle', async () => {
    vi.stubEnv('PROD', true);
    const existing = { scope: '/', installing: {} };
    getRegistration.mockResolvedValue(existing);
    // An install that is already running keeps register() pending until it finishes.
    register.mockReturnValue(new Promise(() => undefined));
    registerPwaUpdates();
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledWith({ registration: existing }));
  });

  it('keeps the plugin registration in dev and does not start the update controller', () => {
    vi.stubEnv('PROD', false);
    registerPwaUpdates();
    expect(mocks.registerSW).toHaveBeenCalledWith({ immediate: true });
    expect(register).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
