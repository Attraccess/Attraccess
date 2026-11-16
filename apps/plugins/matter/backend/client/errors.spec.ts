import {
  SidecarIncompatibleError,
  SidecarMisconfiguredError,
  SidecarRequestError,
  SidecarUnauthorizedError,
  SidecarUnavailableError,
  classifyHttpFailure,
  classifyNetworkError,
  closedUnexpectedly,
  fromErrorEnvelope,
  protocolError,
} from './errors';

const failure = (code: string | undefined, message: string) => Object.assign(new Error(message), { code });
const CORRELATION_ID = '11111111-1111-4111-8111-111111111111';

describe('classifyNetworkError', () => {
  it('decides by the error code, not by words in the message', () => {
    const dns = classifyNetworkError(failure('ENOTFOUND', 'getaddrinfo ENOTFOUND matter-tls.lan'));
    expect(dns).toBeInstanceOf(SidecarUnavailableError);
    expect(dns).toMatchObject({ code: 'network', retryable: true });
    const reset = classifyNetworkError(
      failure('ECONNRESET', 'Client network socket disconnected before secure TLS connection was established'),
    );
    expect(reset).toBeInstanceOf(SidecarUnavailableError);
    // An unrelated code whose message happens to mention SSL is not a TLS failure either.
    expect(classifyNetworkError(failure('ERR_SOCKET_CLOSED', 'ssl socket closed'))).toBeInstanceOf(
      SidecarUnavailableError,
    );
  });

  it.each([
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'ERR_SSL_WRONG_VERSION_NUMBER',
    'ERR_OSSL_PEM_NO_START_LINE',
    'HOSTNAME_MISMATCH',
  ])('reports the TLS code %s as misconfigured', (code) => {
    const error = classifyNetworkError(failure(code, 'whatever'));
    expect(error).toBeInstanceOf(SidecarMisconfiguredError);
    expect(error.code).toBe('tls');
  });

  it('falls back to a narrow message check only without a code', () => {
    expect(classifyNetworkError(failure(undefined, 'self-signed certificate'))).toBeInstanceOf(
      SidecarMisconfiguredError,
    );
    expect(classifyNetworkError(failure(undefined, 'tls handshake to matter-ssl.lan'))).toBeInstanceOf(
      SidecarUnavailableError,
    );
  });

  it('keeps the correlation ID the request was sent with', () => {
    expect(classifyNetworkError(failure('ECONNREFUSED', 'refused'), CORRELATION_ID).correlationId).toBe(CORRELATION_ID);
    expect(classifyNetworkError(failure('CERT_HAS_EXPIRED', 'expired'), CORRELATION_ID).correlationId).toBe(
      CORRELATION_ID,
    );
  });

  it('marks a possibly delivered physical operation as uncertain and not retryable', () => {
    const error = classifyNetworkError(failure('ECONNRESET', 'socket hang up'), CORRELATION_ID, 'uncertain');
    expect(error).toMatchObject({ kind: 'unavailable', retryable: false, outcome: 'uncertain' });
    expect(error.message).toMatch(/uncertain/);
  });
});

describe('event-stream failures', () => {
  it('maps an error message by its contract code, without inventing an HTTP status', () => {
    const error = fromErrorEnvelope({
      code: 'unauthorized',
      message: 'nope',
      correlationId: CORRELATION_ID,
      retryable: false,
    });
    expect(error).toBeInstanceOf(SidecarUnauthorizedError);
    expect(error).toMatchObject({ message: 'nope', correlationId: CORRELATION_ID, status: undefined });
    expect(
      fromErrorEnvelope({ code: 'validation_failed', message: 'bad', correlationId: CORRELATION_ID, retryable: false }),
    ).toBeInstanceOf(SidecarRequestError);
  });

  it('describes protocol errors and unexpected close codes honestly, still as unavailable', () => {
    const protocol = protocolError();
    expect(protocol).toBeInstanceOf(SidecarUnavailableError);
    expect(protocol.code).toBe('invalid_response');
    expect(protocol.message).not.toMatch(/HTTP/);
    const closed = closedUnexpectedly(1011);
    expect(closed).toBeInstanceOf(SidecarUnavailableError);
    expect(closed.message).toContain('1011');
    expect(closed.message).not.toMatch(/ECONNRESET/);
    expect(closedUnexpectedly(1006).message).toMatch(/without a close frame/);
  });
});

describe('classifyHttpFailure', () => {
  it('turns a 426 unsupported_wire_version envelope into an incompatible error with details', () => {
    const body = JSON.stringify({
      error: {
        code: 'unsupported_wire_version',
        message: 'Unsupported wire version.',
        correlationId: CORRELATION_ID,
        retryable: false,
        details: { supportedWireVersion: 1 },
      },
    });
    const error = classifyHttpFailure(426, body);
    expect(error).toBeInstanceOf(SidecarIncompatibleError);
    expect(error).toMatchObject({ status: 426, details: { supportedWireVersion: 1 }, correlationId: CORRELATION_ID });
  });
});
