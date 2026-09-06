import { Logger } from '@nestjs/common';
import { ResourceFlowNode } from '@attraccess/database-entities';
import axios from 'axios';
import { HttpSendRequestExecutor } from './http-send-request.executor';
import { NodeExecutionContext } from './node-executor.interface';

jest.mock('axios');

describe('HttpSendRequestExecutor', () => {
  let executor: HttpSendRequestExecutor;
  let ctx: NodeExecutionContext;

  const makeNode = (data: object): ResourceFlowNode =>
    ({ id: 'n1', type: 'OUTPUT_HTTP_SEND_REQUEST', resourceId: 1, data }) as unknown as ResourceFlowNode;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    executor = new HttpSendRequestExecutor();

    ctx = {
      transactionManager: undefined,
      // Templating proof: replace "{{x}}" tokens with the input's matching value.
      compileTemplate: jest.fn((tpl: string, data: object) =>
        tpl.replace(/\{\{(\w+)\}\}/g, (_m, key) => String((data as Record<string, unknown>)[key] ?? '')),
      ),
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;
  });

  it('compiles url/method/headers/body and calls axios.request with compiled values', async () => {
    (axios.request as jest.Mock).mockResolvedValue({ data: { ok: true, id: 42 } });

    const node = makeNode({
      url: 'https://example.com/api/{{path}}',
      method: 'POST',
      headers: {
        Authorization: 'Bearer {{token}}',
        'X-Static': 'static-value',
      },
      body: 'hello {{name}}',
    });
    const input = { path: 'users', token: 'abc123', name: 'world' };

    const result = await executor.execute(node, input, ctx);

    expect(axios.request).toHaveBeenCalledTimes(1);
    expect(axios.request).toHaveBeenCalledWith({
      url: 'https://example.com/api/users',
      method: 'POST',
      headers: {
        Authorization: 'Bearer abc123',
        'X-Static': 'static-value',
      },
      data: 'hello world',
    });

    // compileTemplate invoked for url, method, each header value, and body.
    expect(ctx.compileTemplate).toHaveBeenCalledWith('https://example.com/api/{{path}}', input);
    expect(ctx.compileTemplate).toHaveBeenCalledWith('POST', input);
    expect(ctx.compileTemplate).toHaveBeenCalledWith('Bearer {{token}}', input);
    expect(ctx.compileTemplate).toHaveBeenCalledWith('static-value', input);
    expect(ctx.compileTemplate).toHaveBeenCalledWith('hello {{name}}', input);
    // url + method + 2 headers + body = 5 calls.
    expect((ctx.compileTemplate as jest.Mock).mock.calls).toHaveLength(5);

    expect(result).toEqual({ payload: { ok: true, id: 42 } });
  });

  it('defaults headers to {} and body to "" when omitted', async () => {
    (axios.request as jest.Mock).mockResolvedValue({ data: 'response-body' });

    const node = makeNode({ url: 'https://example.com', method: 'GET' });

    const result = await executor.execute(node, {}, ctx);

    expect(axios.request).toHaveBeenCalledWith({
      url: 'https://example.com',
      method: 'GET',
      headers: {},
      data: '',
    });
    // Only url, method, and the defaulted empty body get compiled (no headers).
    expect((ctx.compileTemplate as jest.Mock).mock.calls).toHaveLength(3);
    expect(ctx.compileTemplate).toHaveBeenCalledWith('', {});
    expect(result).toEqual({ payload: 'response-body' });
  });

  it('defaults url and method to "" when missing on data', async () => {
    (axios.request as jest.Mock).mockResolvedValue({ data: null });

    const node = makeNode({});

    const result = await executor.execute(node, {}, ctx);

    expect(axios.request).toHaveBeenCalledWith({
      url: '',
      method: '',
      headers: {},
      data: '',
    });
    expect(result).toEqual({ payload: null });
  });

  it('propagates axios.request rejection', async () => {
    const err = new Error('network down');
    (axios.request as jest.Mock).mockRejectedValue(err);

    const node = makeNode({ url: 'https://example.com', method: 'GET' });

    await expect(executor.execute(node, {}, ctx)).rejects.toThrow('network down');
  });

  it('uses the configured response timeout', async () => {
    (axios.request as jest.Mock).mockResolvedValue({ data: {} });

    await executor.execute(makeNode({ url: 'https://example.com', method: 'GET', timeoutSeconds: 12 }), {}, ctx);

    expect(axios.request).toHaveBeenCalledWith(expect.objectContaining({ timeout: 12000 }));
  });

  it('continues with the input after dispatch without waiting for a response', async () => {
    let resolveRequest: (value: { data: unknown }) => void = () => undefined;
    (axios.request as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const input = { requestId: 'abc' };

    await expect(
      executor.execute(
        makeNode({ url: 'https://example.com', method: 'POST', completionBehavior: 'dispatch' }),
        input,
        ctx,
      ),
    ).resolves.toEqual({ payload: input });

    resolveRequest({ data: { ignored: true } });
  });

  it('uses a finite timeout for dispatch requests without a configured timeout', async () => {
    (axios.request as jest.Mock).mockResolvedValue({ data: {} });

    await executor.execute(
      makeNode({ url: 'https://example.com', method: 'POST', completionBehavior: 'dispatch' }),
      {},
      ctx,
    );

    expect(axios.request).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30_000 }));
  });

  it('logs asynchronous dispatch failures without failing the continued flow', async () => {
    const error = new Error('network down');
    (axios.request as jest.Mock).mockRejectedValue(error);
    const logger = jest.spyOn(Logger.prototype, 'error');

    await expect(
      executor.execute(
        makeNode({ url: 'https://example.com', method: 'POST', completionBehavior: 'dispatch' }),
        {},
        ctx,
      ),
    ).resolves.toEqual({ payload: {} });
    await Promise.resolve();

    expect(logger).toHaveBeenCalledWith('HTTP request dispatch failed: https://example.com', error);
  });

  it('classifies controller responses separately from transport failures', () => {
    expect(executor.getFailureKind({ response: { status: 500 } })).toBe('controller-rejection');
    expect(executor.getFailureKind(new Error('network down'))).toBe('transport-dispatch');
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT'])('classifies Axios %s response timeouts separately', (code) => {
    const error = Object.assign(new Error('timeout'), { code });
    jest.mocked(axios.isAxiosError).mockReturnValue(true);

    expect(executor.getFailureKind(error)).toBe('acknowledgement-timeout');
  });
});
