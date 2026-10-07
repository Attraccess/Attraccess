import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerSendsASudoPasswordBeforeCommandInputForAlternateSshUsers(
  _scope: WagoCommissioningServiceTestScope,
): void {
  it('sends a sudo password before command input for alternate SSH users', async () => {
    const service = new WagoCommissioningService({} as PluginContext, {} as WagoService);
    const run = jest.fn().mockResolvedValue('');
    service['run'] = run;

    await service['sudoRun'](
      '192.168.1.10',
      'SHA256:test',
      { username: 'operator', password: 'secret' },
      'base64 -d | sh',
      'script',
    );

    expect(run).toHaveBeenCalledWith(
      '192.168.1.10',
      'SHA256:test',
      { username: 'operator', password: 'secret' },
      "sudo -S sh -c 'base64 -d | sh'",
      'secret\nscript',
      undefined,
    );
  });
}
