import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerDoesNotExposeSubprocessSDuringHostKeyScanning(_scope: WagoCommissioningServiceTestScope): void {
  it.each(['stderr', 'error'])('does not expose subprocess %s during host-key scanning', async (failure) => {
    jest.mocked(spawn).mockImplementation((() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: Object.assign(new EventEmitter(), { end: jest.fn() }),
        kill: jest.fn(),
      });
      queueMicrotask(() => {
        if (failure === 'error') child.emit('error', new Error('unlabelled-process-secret'));
        else child.stderr.emit('data', 'unlabelled-process-secret');
        child.emit('close', 1);
      });
      return child;
    }) as never);
    const context = { getMqttServerConfig: jest.fn().mockResolvedValue({}) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {} as WagoService);
    await expect(service.create({ mqttServerId: 2, targetHost: '10.0.0.1', name: 'Mock' })).rejects.toThrow(
      'Commissioning SSH host-key scan failed.',
    );
  });
}
