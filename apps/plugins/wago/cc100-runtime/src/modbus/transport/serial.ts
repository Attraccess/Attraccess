import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import type { ModbusConnection } from '../../../../modbus/model';
import { WriteAdmissionError } from '../../runtime/types';
import { TransactionAdmission } from './contracts';
import { ModbusTransportError, SerialAdmissionRejected } from './errors';

/** Linux production RTU using Python's standard POSIX termios/select, no native npm addon.
 * Opens only the configured serial path; raw 8-bit framing; exclusive advisory lock;
 * flushes stale input and observes >=3.5 character silence before sending.
 */
const SERIAL_PROGRAM = `
import os,sys,termios,select,time,fcntl
path,baud,parity,stop,timeout,hexdata,expires=sys.argv[1:]
end=time.monotonic()+float(timeout)/1000
fd=os.open(path,os.O_RDWR|os.O_NOCTTY|os.O_NONBLOCK)
try:
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 a=termios.tcgetattr(fd)
 a[0]=0; a[1]=0; a[2]=termios.CLOCAL|termios.CREAD|termios.CS8; a[3]=0
 if parity!='none': a[2]|=termios.PARENB
 if parity=='odd': a[2]|=termios.PARODD
 if stop=='2': a[2]|=termios.CSTOPB
 a[4]=a[5]=getattr(termios,'B'+baud); a[6][termios.VMIN]=0; a[6][termios.VTIME]=0
 termios.tcsetattr(fd,termios.TCSANOW,a)
 time.sleep(max(0.00175,3.5*11/int(baud)))
 termios.tcflush(fd,termios.TCIOFLUSH)
 request=bytes.fromhex(hexdata); started=False
 while request:
  if not select.select([], [fd], [], max(0,end-time.monotonic()))[1]: raise TimeoutError('serial write timeout')
  if not started:
   # All potentially slow preparation and readiness waits precede admission.
   os.write(3,b'R')
   if sys.stdin.buffer.readline()!=b'GO\\n': raise RuntimeError('serial admission denied')
   if expires and time.time()*1000>=float(expires): sys.exit(75)
  if time.monotonic()>=end: raise TimeoutError('serial write timeout')
  n=os.write(fd,request)
  if n<=0: raise RuntimeError('serial write made no progress')
  started=True; request=request[n:]
 response=b''
 while time.monotonic()<end:
  if not select.select([fd],[],[],max(0,end-time.monotonic()))[0]: break
  response+=os.read(fd,256)
  if len(response)>256: raise ValueError('oversized RTU frame')
  if len(response)>=3:
   size=5 if response[1]&128 else (response[2]+5 if response[1] in (1,3,4) else 8)
   if len(response)>=size: sys.stdout.buffer.write(response); break
 else: raise TimeoutError('serial read timeout')
 if not response: raise TimeoutError('serial read timeout')
finally:
 os.close(fd)
`;

export function serialExchange(
  c: Extract<ModbusConnection, { transport: 'rtu' }>,
  request: Buffer,
  signal?: AbortSignal,
  isCurrent?: TransactionAdmission,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('RTU exchange aborted'));
      return;
    }
    const child = spawn(
      'python3',
      [
        '-c',
        SERIAL_PROGRAM,
        c.path,
        String(c.baudRate),
        c.parity,
        String(c.stopBits),
        String(c.timeoutMs),
        request.toString('hex'),
        isCurrent?.expiresAt === undefined ? '' : String(isCurrent.expiresAt),
      ],
      { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] },
    );
    let output = Buffer.alloc(0);
    let failure: Error | undefined;
    let authorized = false;
    const abort = () => {
      failure ??= new Error('RTU exchange timed out or aborted');
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, c.timeoutMs);
    const fail = (error: Error) => {
      failure ??= error;
      child.kill('SIGKILL');
    };
    // A private pipe carries exactly one readiness byte; stdout remains binary RTU data.
    (child.stdio[3] as Readable).on('data', (chunk: Buffer) => {
      if (failure) return;
      if (authorized || chunk.length !== 1 || chunk[0] !== 82) {
        fail(new Error('invalid serial admission handshake'));
        return;
      }
      try {
        if (isCurrent && !isCurrent())
          throw new ModbusTransportError(
            'modbus_configuration_changed',
            'Modbus configuration changed before transmission',
          );
      } catch (error) {
        fail(new SerialAdmissionRejected(error));
        return;
      }
      authorized = true;
      child.stdin.end('GO\n');
    });
    (child.stdio[3] as Readable).on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('data', (chunk: Buffer) => {
      output = Buffer.concat([output, chunk]);
      if (output.length > 256) {
        failure = new Error('oversized RTU frame');
        child.kill('SIGKILL');
      }
    });
    child.stderr.resume();
    child.once('error', (error) => {
      // Node emits close after error; never release ownership before streams/process teardown.
      failure = error;
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code === 75 && authorized && output.length === 0 && isCurrent?.expiresAt !== undefined)
        reject(new SerialAdmissionRejected(new WriteAdmissionError('expired')));
      else if (code !== 0 || !authorized)
        reject(new Error('RTU exchange failed or timed out (Python3/POSIX serial required)'));
      else resolve(output);
    });
  });
}
