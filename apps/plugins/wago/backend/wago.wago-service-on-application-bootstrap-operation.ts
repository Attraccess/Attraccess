import { WagoController } from './wago-controller.entity';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceRefreshNetworkConnectionOperation } from './wago.wago-service-refresh-network-connection-operation';
import { MqttSubscriptionError } from './wago.mqtt-subscription-error';


export abstract class WagoServiceOnApplicationBootstrapOperation extends WagoServiceRefreshNetworkConnectionOperation {
  async onApplicationBootstrap(): Promise<void> {
    // The host datasource is available only after plugin module construction completes.
    this.controllers = this.context.getRepository(WagoController);
    this.settings = this.context.getRepository(WagoSettings);
    this.enrollments = this.context.getRepository(WagoEnrollment);
    this.drafts = this.context.getRepository(WagoConfigurationDraft);
    this.revisions = this.context.getRepository(WagoConfigurationRevision);
    const enrollments = await this.enrollments
      .createQueryBuilder('enrollment')
      .where('enrollment.consumedAt IS NULL')
      .getMany();
    for (const enrollment of enrollments) this.scheduleEnrollmentExpiry(enrollment);
    try {
      await this.subscribeConfiguredServers();
    } catch (error) {
      if (!(error instanceof MqttSubscriptionError)) throw error;
      this.context.logger.warn(
        `Could not establish WAGO MQTT subscriptions during startup: ${String(error.mqttError)}`,
      );
      this.scheduleSubscriptionRetry();
    }
  }
}
