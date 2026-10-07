import { assertCommissioningBroker } from './wago-commissioning-preflight';
import { NetworkChangeError } from "./wago-network-change.service.errors";
import { WagoNetworkChangeServicePhaseOperation } from "./wago-network-change.service.wago-network-change-service-phase-operation";
export abstract class WagoNetworkChangeServiceBrokerConnectionOperation extends WagoNetworkChangeServicePhaseOperation {

  protected async brokerConnection(mqttServerId: number) {
    const broker = await this.context.getMqttServerConfig(mqttServerId);
    if (!broker) throw new NetworkChangeError('broker_configuration');
    try {
      assertCommissioningBroker(broker);
    } catch {
      throw new NetworkChangeError('broker_configuration');
    }
    if (
      (broker.tlsServername && !/^[A-Za-z0-9.-]+$/.test(broker.tlsServername)) ||
      (broker.caCert?.length ?? 0) > 32768
    )
      throw new NetworkChangeError('broker_configuration');
    return {
      url: `${broker.useTls ? 'mqtts' : 'mqtt'}://${broker.host}:${broker.port}`,
      tlsInsecure: !!(broker.useTls && broker.tlsInsecure),
      tlsServername: broker.useTls ? (broker.tlsServername ?? '') : '',
      caCert: broker.useTls && !broker.tlsInsecure ? (broker.caCert ?? '') : '',
    };
  }
}
