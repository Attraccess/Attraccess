import { WagoControllerSummary } from './wago.service.wago-controller-summary';
import { WagoServiceCommandFailureKindOperation } from './wago.wago-service-command-failure-kind-operation';

export abstract class WagoServiceListOperation extends WagoServiceCommandFailureKindOperation {
  async list(): Promise<WagoControllerSummary[]> {
    const controllers = await this.controllers.find({ order: { hardwareId: 'ASC' } });
    return controllers.map((controller) => ({
      id: controller.id,
      hardwareId: controller.hardwareId,
      trustState: controller.trustState,
      name: controller.name,
      mqttServerId: controller.mqttServerId,
      enrollmentId: controller.enrollmentId,
      protocolVersion: controller.protocolVersion,
      runtimeVersion: controller.runtimeVersion,
      capabilities: controller.capabilities,
      lastSequence: controller.lastSequence,
      lastHeartbeatAt: this.diagnostics.read(controller.id).heartbeatAt ?? controller.lastHeartbeatAt,
      lastSeenAt: controller.lastSeenAt,
      compatibilityError: controller.compatibilityError,
      createdAt: controller.createdAt,
      updatedAt: controller.updatedAt,
      connectivity: this.connectivity(controller),
    }));
  }
}
