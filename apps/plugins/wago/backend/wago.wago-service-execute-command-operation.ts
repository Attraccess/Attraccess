import { WagoServiceValidateCommandConfigOperation } from './wago.wago-service-validate-command-config-operation';


export abstract class WagoServiceExecuteCommandOperation extends WagoServiceValidateCommandConfigOperation {
  async executeCommand(config: Record<string, unknown>): Promise<void> {
    return this.commands.execute(config);
  }
}
