import { Logger } from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import 'reflect-metadata';
import { validateSnapshot as validateBackend } from '../backend/configuration/model';
import { validateSnapshot } from '../cc100-runtime/src/runtime';
import { temporary } from './production-fleet-globals.test-utils';

import { FleetFixtureState } from './production-fleet-fixture.test-utils';
export async function prepareFleetHardware(state: FleetFixtureState): Promise<string> {
  const url = process.env.WAGO_FLEET_MQTT_URL;
  if (!temporary || !url || !/^mqtt:\/\/127\.0\.0\.1:\d+$/.test(url))
    throw new Error(
      'Run node apps/plugins/wago/scripts/test-production-fleet.mjs; only a runner-owned loopback broker is allowed',
    );
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation((error) => state.errors.push(error));
  await writeFile(state.din, '0');
  await writeFile(state.dout, '8'); // DO4 is unrelated to either flow and must survive read/modify/write.
  state.server = createServer((socket) => {
    state.sockets.add(socket);
    socket.on('close', () => state.sockets.delete(socket));
    socket.on('error', (error) => state.errors.push(error));
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 7 && pending.length >= 6 + pending.readUInt16BE(4)) {
        const length = 6 + pending.readUInt16BE(4);
        const request = Buffer.from(pending.subarray(0, length));
        pending = pending.subarray(length);
        state.modbusRequests.push(request);
        // Explicit fixture map: unit 7, FC03, zero-based register 12, IEEE float32.
        if (request[6] !== 7 || request[7] !== 3 || request.readUInt16BE(8) !== 12 || request.readUInt16BE(10) !== 2) {
          state.errors.push(new Error(`Unexpected Modbus request ${request.toString('hex')}`));
          socket.destroy();
          return;
        }
        const response = Buffer.alloc(13);
        request.copy(response, 0, 0, 7);
        response.writeUInt16BE(7, 4);
        response[7] = 3;
        response[8] = 4;
        response.writeFloatBE(state.modbusRaw, 9);
        socket.end(response);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    state.server.once('error', reject);
    state.server.listen(0, '127.0.0.1', resolve);
  });
  const address = state.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback Modbus port');
  state.snapshot = {
    version: 1,
    physicalPoints: [
      { id: 'di1', hardwareProfile: '751-9301', channel: 4 },
      { id: 'do1', hardwareProfile: '751-9301', channel: 0 },
      { id: 'do2', hardwareProfile: '751-9301', channel: 1 },
      { id: 'meter', hardwareProfile: 'modbus', channel: 0, modbus: { deviceId: 'meter', measurementId: 'power' } },
    ],
    logicalChannels: [
      {
        id: 'input',
        physicalPointId: 'di1',
        profile: 'generic-monitored-input',
        capabilities: ['input'],
        disconnectPolicy: { mode: 'hold' },
      },
      {
        id: 'input-load',
        physicalPointId: 'do1',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'hold' },
      },
      {
        id: 'meter-load',
        physicalPointId: 'do2',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'hold' },
      },
      {
        id: 'power',
        physicalPointId: 'meter',
        profile: 'generic-monitored-input',
        capabilities: ['input', 'measurement'],
        disconnectPolicy: { mode: 'hold' },
        measurement: { unit: 'watt', scale: 1, offset: 0, kind: 'live' },
      },
    ],
    modbus: {
      connections: [
        {
          id: 'tcp',
          transport: 'tcp',
          host: '127.0.0.1',
          port: address.port,
          timeoutMs: 1000,
          reconnectMs: 0,
          queueLimit: 4,
        },
      ],
      devices: [
        {
          id: 'meter',
          name: 'Loopback fixture only',
          connectionId: 'tcp',
          unitId: 7,
          profileId: 'fixture-map',
          profileVersion: 1,
        },
      ],
      profiles: [
        {
          id: 'fixture-map',
          name: 'Unqualified fixture register map',
          version: 1,
          actions: [],
          measurements: [
            {
              id: 'power',
              name: 'Power',
              functionCode: 3,
              address: 12,
              addressBase: 0,
              dataType: 'float32',
              byteOrder: 'big',
              wordOrder: 'big',
              scale: 1,
              offset: 0,
              unit: 'watt',
              kind: 'live',
              pollIntervalMs: 100,
            },
          ],
        },
      ],
    },
  };
  expect(validateSnapshot(state.snapshot)).toEqual([]);
  expect(validateBackend(state.snapshot)).toEqual([]);

  return url;
}
