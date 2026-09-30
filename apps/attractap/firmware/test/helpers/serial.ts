import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Inbox } from './inbox';
export const resultsDirectory = fileURLToPath(new URL('../../test-results/', import.meta.url));

export class SerialDevice {
  readonly lines = new Inbox<string>();
  private child?: ChildProcessWithoutNullStreams;
  constructor(
    private path: string,
    private pin: string,
  ) {}
  async open() {
    this.child = spawn(process.env.HIL_PYTHON ?? 'python', [
      new URL('./serial_bridge.py', import.meta.url).pathname,
      this.path,
    ]);
    this.child.on('error', (error) => this.lines.fail(error));
    this.child.on('exit', (code) => this.lines.fail(new Error(`Serial bridge exited: ${code}`)));
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      // Firmware echoes provisioning payloads: never persist those secrets.
      if (!line.includes('Handling command:')) appendFileSync(join(resultsDirectory, 'serial.log'), `${line}\n`);
      this.lines.push(line);
    });
    this.child.stderr.on('data', (data) => appendFileSync(join(resultsDirectory, 'serial-bridge.log'), data));
    await this.lines.wait((line) => line === 'BRIDGE_READY');
  }
  sendSerialMessage(topic: string, payload: Record<string, unknown> = {}) {
    const command = `CMND ${topic} ${JSON.stringify(payload)}\n`;
    if (Buffer.byteLength(command.trimEnd()) > 256)
      throw new Error(`Serial command exceeds firmware's 256-byte limit: ${topic}`);
    if (!this.child?.stdin.writable) throw new Error('Serial bridge is not writable');
    this.child.stdin.write(command);
  }
  waitForSerialMessage(pattern: string | RegExp, after = this.lines.mark(), timeout = 30000) {
    return this.lines.wait(
      (line) => (typeof pattern === 'string' ? line.includes(pattern) : pattern.test(line)),
      after,
      timeout,
    );
  }
  async command(topic: string, payload: Record<string, unknown> = {}, authorized = true): Promise<any> {
    const after = this.lines.mark();
    this.sendSerialMessage(topic, authorized ? { ...payload, authCode: this.pin } : payload);
    const line = await this.lines.wait((line) => line.startsWith(`RESP ${topic} `), after);
    return JSON.parse(line.slice(`RESP ${topic} `.length));
  }
  async probe(type: string, after: number): Promise<any> {
    const line = await this.lines.wait((line) => line.startsWith(`HIL ${type} `), after);
    return JSON.parse(line.slice(`HIL ${type} `.length));
  }
  async close() {
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null || !this.child.pid) return;
    const child = this.child;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      child.once('close', finish);
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish();
      }, 3000);
      child.stdin.end();
    });
  }
}
