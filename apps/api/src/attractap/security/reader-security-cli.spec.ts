import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync, chmodSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection, createServer } from 'node:net';
import { ReaderIdentityService } from './reader-identity.service';
import { ReaderSecurityCommandServer, sendReaderSecurityCommand } from './reader-security-cli';

describe('protected API-host reader commands', () => {
  let directory: string;
  let server: ReaderSecurityCommandServer;
  let identities: { directory: string; revoke: jest.Mock; enroll: jest.Mock; issue: jest.Mock };
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'reader-command-'));
    chmodSync(directory, 0o700);
    identities = {
      directory,
      issue: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
      enroll: jest.fn().mockResolvedValue({ generation: 1 }),
    };
    server = new ReaderSecurityCommandServer(identities as unknown as ReaderIdentityService);
    await server.listen();
  });
  afterEach(async () => {
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('recovers a socket left by a killed process and refuses an active listener or substituted file', async () => {
    await server.close();
    const path = join(directory, 'reader-control.sock');
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
      const fs = require('node:fs');
      require('node:net').createServer().listen(process.argv[1], () => {
        fs.chmodSync(process.argv[1], 0o600); process.stdout.write('ready\\n');
      });
    `,
        path,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await once(child.stdout, 'data');
    child.kill('SIGKILL');
    await once(child, 'exit');
    await server.listen();
    await expect(sendReaderSecurityCommand(directory, { command: 'revoke', readerId: 7 })).resolves.toMatchObject({
      ok: true,
    });
    const replacement = new ReaderSecurityCommandServer(identities as unknown as ReaderIdentityService);
    await expect(replacement.listen()).rejects.toThrow('already active');
    await expect(sendReaderSecurityCommand(directory, { command: 'revoke', readerId: 7 })).resolves.toMatchObject({
      ok: true,
    });
    await server.close();
    writeFileSync(path, 'substituted', { mode: 0o600 });
    await expect(replacement.listen()).rejects.toThrow('Unsafe existing');
  });

  it('uses a 0600 Unix socket and waits for revocation to finish', async () => {
    expect(statSync(join(directory, 'reader-control.sock')).mode & 0o777).toBe(0o600);
    let finish: () => void;
    identities.revoke.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let settled = false;
    const response = sendReaderSecurityCommand(directory, { command: 'revoke', readerId: 7 }).then((result) => {
      settled = true;
      return result;
    });
    while (!finish) await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    finish();
    await expect(response).resolves.toEqual({ ok: true, result: { revoked: true } });
  });

  it('rejects unknown commands and secret-bearing fields before services', async () => {
    for (const command of [
      { command: 'shell', executable: 'ignored' },
      { command: 'enroll', privateKey: 'canary' },
      { command: 'revoke', readerId: 7, token: 'canary' },
    ])
      await expect(sendReaderSecurityCommand(directory, command)).resolves.toEqual({
        ok: false,
        error: 'READER_COMMAND_DENIED',
      });
    expect(identities.revoke).not.toHaveBeenCalled();
    expect(identities.enroll).not.toHaveBeenCalled();
  });

  it('refuses unsafe directory or socket permissions', async () => {
    chmodSync(directory, 0o755);
    await expect(sendReaderSecurityCommand(directory, { command: 'revoke', readerId: 7 })).rejects.toThrow('Unsafe');
    chmodSync(directory, 0o700);
    chmodSync(join(directory, 'reader-control.sock'), 0o666);
    await expect(sendReaderSecurityCommand(directory, {})).rejects.toThrow('Unsafe');
  });

  it('accepts exactly 4096 encoded request bytes', async () => {
    const body = JSON.stringify({ command: 'revoke', readerId: 7 });
    const request = body + ' '.repeat(4095 - Buffer.byteLength(body)) + '\n';
    const response = await new Promise<string>((resolve, reject) => {
      const socket = createConnection(join(directory, 'reader-control.sock'));
      let received = '';
      socket.on('connect', () => socket.write(request));
      socket.on('data', (bytes) => (received += bytes.toString()));
      socket.on('error', reject);
      socket.on('end', () => resolve(received));
    });
    expect(JSON.parse(response).ok).toBe(true);
    expect(identities.revoke).toHaveBeenCalledTimes(1);
  });

  it('emits exactly 4096 bytes and replaces a 4097-byte success with bounded denial', async () => {
    const overhead = Buffer.byteLength(JSON.stringify({ ok: true, result: '' }) + '\n');
    const command = { command: 'issue', readerId: 7, publicKeyFile: '/protected/public.pem' };
    identities.issue.mockResolvedValue('x'.repeat(4096 - overhead));
    const accepted = await sendReaderSecurityCommand(directory, command);
    expect(Buffer.byteLength(JSON.stringify(accepted) + '\n')).toBe(4096);
    identities.issue.mockResolvedValue('x'.repeat(4097 - overhead));
    await expect(sendReaderSecurityCommand(directory, command)).resolves.toEqual({
      ok: false,
      error: 'READER_COMMAND_DENIED',
    });
  });

  it('closes oversized raw commands with no side effect', async () => {
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(join(directory, 'reader-control.sock'));
      socket.on('connect', () => socket.write(Buffer.alloc(4097, 120)));
      socket.on('error', reject);
      socket.on('close', () => resolve());
    });
    expect(identities.revoke).not.toHaveBeenCalled();
    expect(identities.enroll).not.toHaveBeenCalled();
  });

  it('rejects oversized requests in the client before any service call', async () => {
    await expect(
      sendReaderSecurityCommand(directory, { command: 'issue', publicKeyFile: 'x'.repeat(4097) }),
    ).rejects.toThrow('exceeds limit');
    expect(identities.issue).not.toHaveBeenCalled();
  });

  it('enforces the response limit independently of the command server', async () => {
    await server.close();
    const overhead = Buffer.byteLength(JSON.stringify({ ok: true, result: '' }) + '\n');
    let responseSize = 4096;
    const peer = createServer((socket) => {
      socket.on('error', () => socket.destroy());
      socket.once('data', () =>
        socket.end(JSON.stringify({ ok: true, result: 'x'.repeat(responseSize - overhead) }) + '\n'),
      );
    });
    const path = join(directory, 'reader-control.sock');
    await new Promise<void>((resolve) => peer.listen(path, resolve));
    chmodSync(path, 0o600);
    try {
      const reply = await sendReaderSecurityCommand(directory, { command: 'status', readerId: 7 });
      expect(Buffer.byteLength(JSON.stringify(reply) + '\n')).toBe(4096);
      responseSize = 4097;
      await expect(sendReaderSecurityCommand(directory, { command: 'status', readerId: 7 })).rejects.toThrow(
        'exceeds limit',
      );
    } finally {
      await new Promise<void>((resolve, reject) => peer.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
