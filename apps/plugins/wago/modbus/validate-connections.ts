import { ModbusConfiguration } from './model-contracts';
import { modbusHostIdentity } from './model.modbus-host-identity';
import { ModbusValidation } from './validation-context';
export function validateConnections(config: ModbusConfiguration, validation: ModbusValidation): void {
  const { fail, integer, name, keys } = validation;
  const endpoints = new Set<string>();
  config.connections.forEach((c, i) => {
    const path = `modbus.connections[${i}]`;
    keys(
      c,
      [
        'id',
        'timeoutMs',
        'reconnectMs',
        'queueLimit',
        ...(c.transport === 'tcp'
          ? ['transport', 'host', 'port']
          : ['transport', 'path', 'baudRate', 'parity', 'stopBits']),
      ],
      path,
    );
    if (!integer(c.timeoutMs, 10, 60000) || !integer(c.reconnectMs, 0, 60000) || !integer(c.queueLimit, 1, 128))
      fail(path, 'timeout 10..60000ms, reconnect 0..60000ms, queue limit 1..128 required');
    let endpoint: string;
    if (c.transport === 'tcp') {
      if (!name(c.host) || /[\s/]/.test(c.host) || !integer(c.port, 1, 65535))
        return void fail(path, 'TCP host and port 1..65535 required');
      endpoint = `tcp:${modbusHostIdentity(c.host)}:${c.port}`;
    } else if (c.transport === 'rtu') {
      if (
        typeof c.path !== 'string' ||
        !/^\/dev\/[a-zA-Z0-9_./-]+$/.test(c.path) ||
        c.path.includes('..') ||
        c.path
          .split('/')
          .slice(2)
          .some((segment) => segment === '' || segment === '.') ||
        ![1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(c.baudRate) ||
        !['none', 'even', 'odd'].includes(c.parity) ||
        ![1, 2].includes(c.stopBits)
      )
        return void fail(path, 'canonical serial device path, valid baud, parity and stop bits required');
      endpoint = `rtu:${c.path}`;
    } else return void fail(path, 'transport must be tcp or rtu');
    if (endpoints.has(endpoint)) fail(path, 'share one connection for devices on the same endpoint');
    endpoints.add(endpoint);
  });
}
