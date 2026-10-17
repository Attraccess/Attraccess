import { execFile } from 'node:child_process';
import { mkdir, chmod, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export async function createBrokerTls(directory) {
  const tls = join(directory, 'tls');
  await mkdir(tls, { mode: 0o755 });
  const openssl = (...args) => exec('openssl', args, { cwd: tls, timeout: 10_000 });
  await openssl(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
    '-days',
    '2',
    '-subj',
    '/CN=WAGO isolated fixture CA',
  );
  await openssl(
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'server.key',
    '-out',
    'server.csr',
    '-subj',
    '/CN=localhost',
  );
  await writeFile(
    join(tls, 'extensions.cnf'),
    'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',
  );
  await openssl(
    'x509',
    '-req',
    '-in',
    'server.csr',
    '-CA',
    'ca.pem',
    '-CAkey',
    'ca.key',
    '-CAcreateserial',
    '-out',
    'server.pem',
    '-days',
    '2',
    '-extfile',
    'extensions.cnf',
  );
  await rm(join(tls, 'ca.key'));
  await chmod(join(tls, 'server.key'), 0o644); // Run-owned test key; readable by RabbitMQ's container UID.
  await writeFile(
    join(tls, 'rabbitmq.conf'),
    [
      'mqtt.listeners.tcp.default = 1883',
      'mqtt.listeners.ssl.default = 8883',
      'ssl_options.cacertfile = /fixture-tls/ca.pem',
      'ssl_options.certfile = /fixture-tls/server.pem',
      'ssl_options.keyfile = /fixture-tls/server.key',
      'ssl_options.verify = verify_none', // Client identity uses independently provisioned MQTT credentials.
      'ssl_options.fail_if_no_peer_cert = false',
      'management.tcp.port = 15672',
      'management.ssl.port = 15671',
      'management.ssl.cacertfile = /fixture-tls/ca.pem',
      'management.ssl.certfile = /fixture-tls/server.pem',
      'management.ssl.keyfile = /fixture-tls/server.key',
      '',
    ].join('\n'),
  );
  return tls;
}
