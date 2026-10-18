import { createConnection, createServer, Server } from 'node:net';
import { chmodSync, lstatSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { ReaderIdentityService } from './reader-identity.service';

export const READER_COMMAND_MAXIMUM = 4096;

/** Local API-account access only. There is deliberately no network listener. */
export class ReaderSecurityCommandServer {
  private server?: Server;
  private socketIdentity?: { dev: number; ino: number };
  constructor(private readonly identities: ReaderIdentityService) {}

  async listen(): Promise<void> {
    const directory = this.identities.directory;
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700)
      throw new Error('Unsafe reader command directory');
    const path = join(directory, 'reader-control.sock');
    // Never unlink an existing listener or a substituted file automatically.
    this.server = createServer((socket) => {
      let received = Buffer.alloc(0);
      let complete = false;
      socket.setTimeout(5000, () => socket.destroy());
      socket.on('error', () => socket.destroy());
      socket.on('data', async (bytes) => {
        if (typeof bytes === 'string' || complete || received.length + bytes.length > READER_COMMAND_MAXIMUM) {
          received.fill(0);
          socket.destroy();
          return;
        }
        const previous = received;
        received = Buffer.concat([received, bytes]);
        previous.fill(0);
        if (!received.includes(10)) return;
        complete = true;
        try {
          if (received[received.length - 1] !== 10 || received.indexOf(10) !== received.length - 1)
            throw new Error('Invalid command framing');
          const request = JSON.parse(received.toString('utf8'));
          const result = await this.execute(request);
          const response = Buffer.from(JSON.stringify({ ok: true, result }) + '\n');
          if (response.length > READER_COMMAND_MAXIMUM) {
            response.fill(0);
            throw new Error('Reader response exceeds limit');
          }
          socket.end(response, () => response.fill(0));
        } catch {
          socket.end(JSON.stringify({ ok: false, error: 'READER_COMMAND_DENIED' }) + '\n');
        } finally {
          received.fill(0);
        }
      });
      socket.on('close', () => received.fill(0));
    });
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(path, () => {
        try {
          chmodSync(path, 0o600);
          const socket = lstatSync(path);
          this.socketIdentity = { dev: socket.dev, ino: socket.ino };
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async execute(request: unknown): Promise<unknown> {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid reader command');
    const value = request as Record<string, unknown>;
    if (value.command === 'status' && Object.keys(value).every((key) => ['command', 'readerId'].includes(key)))
      return this.identities.status(value.readerId as number);
    if (value.command === 'rewrap-card-keys' && Object.keys(value).length === 1) return this.identities.rewrapCards();
    if (
      value.command === 'configure' &&
      typeof value.file === 'string' &&
      Object.keys(value).every((key) => ['command', 'file'].includes(key))
    ) {
      await this.identities.installConfiguration(value.file);
      return { configured: true };
    }
    if (
      value.command === 'issue' &&
      Object.keys(value).every((key) => ['command', 'readerId', 'publicKeyFile', 'lifetimeSeconds'].includes(key)) &&
      typeof value.publicKeyFile === 'string'
    ) {
      return this.identities.issue({
        readerId: value.readerId as number,
        publicKeyFile: value.publicKeyFile,
        lifetimeSeconds: value.lifetimeSeconds as number,
      });
    }
    if (value.command === 'revoke' && Object.keys(value).every((key) => ['command', 'readerId'].includes(key))) {
      await this.identities.revoke(value.readerId as number);
      return { revoked: true };
    }
    if (['enroll', 'renew', 'replace', 'transfer'].includes(value.command as string)) {
      const allowed = [
        'command',
        'readerId',
        'certificateFile',
        'manifestFile',
        'enrollmentClass',
        'overlapSeconds',
        'replaceReaderId',
      ];
      if (
        Object.keys(value).some((key) => !allowed.includes(key)) ||
        typeof value.certificateFile !== 'string' ||
        typeof value.manifestFile !== 'string' ||
        (['replace', 'transfer'].includes(value.command as string) && !value.replaceReaderId)
      )
        throw new Error('Invalid enrollment command');
      const enrollment = { ...value };
      delete enrollment.command;
      return this.identities.enroll(enrollment as Parameters<ReaderIdentityService['enroll']>[0]);
    }
    throw new Error('Unknown reader command');
  }

  async close(): Promise<void> {
    if (!this.server?.listening) return;
    await new Promise<void>((resolve, reject) => this.server.close((error) => (error ? reject(error) : resolve())));
    const path = join(this.identities.directory, 'reader-control.sock');
    let current: ReturnType<typeof lstatSync>;
    try {
      current = lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (current.isSocket() && current.dev === this.socketIdentity?.dev && current.ino === this.socketIdentity.ino)
      unlinkSync(path);
  }
}

/** Client used by protected API-host administration; input must contain paths only. */
export async function sendReaderSecurityCommand(directory: string, command: unknown): Promise<unknown> {
  const parent = lstatSync(directory);
  const path = join(directory, 'reader-control.sock');
  const socketInfo = lstatSync(path);
  if (
    !parent.isDirectory() ||
    parent.uid !== process.getuid() ||
    (parent.mode & 0o777) !== 0o700 ||
    !socketInfo.isSocket() ||
    socketInfo.uid !== process.getuid() ||
    (socketInfo.mode & 0o777) !== 0o600
  )
    throw new Error('Unsafe reader control socket');
  const bytes = Buffer.from(JSON.stringify(command) + '\n');
  if (bytes.length > READER_COMMAND_MAXIMUM) throw new Error('Reader command exceeds limit');
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let response = Buffer.alloc(0);
    socket.setTimeout(5000, () => socket.destroy(new Error('Reader command timed out')));
    socket.on('connect', () => socket.write(bytes, () => bytes.fill(0)));
    socket.on('data', (chunk) => {
      if (typeof chunk === 'string' || response.length + chunk.length > READER_COMMAND_MAXIMUM)
        socket.destroy(new Error('Reader response exceeds limit'));
      else response = Buffer.concat([response, chunk]);
    });
    socket.on('error', (error) => {
      bytes.fill(0);
      response.fill(0);
      reject(error);
    });
    socket.on('close', () => {
      bytes.fill(0);
      response.fill(0);
    });
    socket.on('end', () => {
      try {
        if (response[response.length - 1] !== 10 || response.indexOf(10) !== response.length - 1)
          throw new Error('Invalid reader response framing');
        resolve(JSON.parse(response.toString('utf8')));
      } catch {
        reject(new Error('Invalid reader command response'));
      } finally {
        response.fill(0);
      }
    });
  });
}
