import { WagoServiceOnConfigurationReportedOperation } from './wago.wago-service-on-configuration-reported-operation';


export abstract class WagoServiceOnCommandAcknowledgementOperation extends WagoServiceOnConfigurationReportedOperation {
  protected onCommandAcknowledgement(controllerId: number, payload: Buffer): void {
    this.commands.acknowledge(controllerId, payload);
  }
}
