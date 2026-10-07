import { WagoServiceCommandSchemaOperation } from './wago.wago-service-command-schema-operation';


export abstract class WagoServiceValidateCommandConfigOperation extends WagoServiceCommandSchemaOperation {
  async validateCommandConfig(config: Record<string, unknown>, validationContext = new Map<string, unknown>()) {
    return this.commands.validate(config, validationContext);
  }
}
