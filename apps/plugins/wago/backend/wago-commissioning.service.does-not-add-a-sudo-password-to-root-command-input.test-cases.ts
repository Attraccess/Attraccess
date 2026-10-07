import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerDoesNotAddASudoPasswordToRootCommandInput(_scope: WagoCommissioningServiceTestScope): void {
  it('does not add a sudo password to root command input', async () => {
    const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
    const run = jest.fn().mockResolvedValue('');
    service['run'] = run;

    await service['sudoRun'](
      '192.168.1.10',
      'SHA256:test',
      { username: 'root', password: 'wago' },
      'base64 -d | sh',
      'script',
    );

    expect(run).toHaveBeenCalledWith(
      '192.168.1.10',
      'SHA256:test',
      { username: 'root', password: 'wago' },
      'base64 -d | sh',
      'script',
      undefined,
    );
  });
}
