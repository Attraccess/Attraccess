import {
  CardOperationBinding,
  ServerVerifiedCardResult,
  VerifiedCardSessionService,
} from './verified-card-session.service';

function requireHandle(handle: string | null): string {
  if (handle === null) throw new Error('Test verifier did not issue a proof');
  return handle;
}

describe('server card proof boundary (test verifier only)', () => {
  const binding: CardOperationBinding = {
    readerId: 1,
    credentialGeneration: 1,
    connectionGeneration: 'connection',
    installationId: 'installation',
    cardId: 'card',
    applicationId: 'application',
    slot: 1,
    activationId: 'activation',
    resourceId: 1,
    operation: 'unlock',
  };
  const service = () =>
    new VerifiedCardSessionService({
      verify: async (request, deadline) => ({ ...request, issuedAt: Date.now(), deadline }),
    });

  afterEach(() => jest.useRealTimers());

  it('denies without a server verifier, including reader-provided success data', async () => {
    const unavailable = new VerifiedCardSessionService();
    expect(unavailable.available).toBe(false);
    expect(await unavailable.verify(binding, Date.now() + 10_000)).toBeNull();
    expect(unavailable.consume('reader-claims-success', binding)).toBe(false);
  });

  it('consumes once, including concurrent attempts', async () => {
    const proofs = service();
    const handle = await proofs.verify(binding, Date.now() + 10_000);
    expect(handle).toEqual(expect.any(String));
    expect(await Promise.all([1, 2].map(async () => proofs.consume(requireHandle(handle), binding)))).toEqual([
      true,
      false,
    ]);
  });

  it.each(Object.keys(binding))('rejects substitution of %s and burns the handle', async (field) => {
    const proofs = service();
    const handle = await proofs.verify(binding, Date.now() + 10_000);
    const original = binding[field as keyof CardOperationBinding];
    expect(
      proofs.consume(requireHandle(handle), {
        ...binding,
        [field]: typeof original === 'number' ? original + 1 : `${original}-other`,
      }),
    ).toBe(false);
    expect(proofs.consume(requireHandle(handle), binding)).toBe(false);
  });

  it('rejects at the exact deadline, after it, and results exceeding 30 seconds', async () => {
    jest.useFakeTimers().setSystemTime(1_000_000);
    const proofs = service();
    expect(await proofs.verify(binding, Date.now() + 30_001)).toBeNull();
    const handle = await proofs.verify(binding, Date.now() + 30_000);
    jest.advanceTimersByTime(30_000);
    expect(proofs.consume(requireHandle(handle), binding)).toBe(false);
    jest.advanceTimersByTime(1);
    expect(proofs.consume(requireHandle(handle), binding)).toBe(false);
  });

  it.each(['connection', 'reader', 'activation'])('cancels proofs on %s invalidation', async (reason) => {
    const proofs = service();
    const handle = await proofs.verify(binding, Date.now() + 10_000);
    if (reason === 'connection') proofs.cancelConnection(binding.connectionGeneration);
    if (reason === 'reader') proofs.cancelReader(binding.readerId);
    if (reason === 'activation') proofs.cancelActivation(binding.connectionGeneration, binding.activationId);
    expect(proofs.consume(requireHandle(handle), binding)).toBe(false);
  });

  it('cancels verification in flight so disconnect cannot mint a later proof', async () => {
    let complete!: (result: ServerVerifiedCardResult) => void;
    const proofs = new VerifiedCardSessionService({
      verify: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    });
    const issuedAt = Date.now();
    const deadline = issuedAt + 10_000;
    const pending = proofs.verify(binding, deadline);
    proofs.cancelConnection(binding.connectionGeneration);
    complete({ ...binding, issuedAt, deadline });
    expect(await pending).toBeNull();
  });
});
