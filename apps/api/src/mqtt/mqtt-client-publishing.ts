import { MqttClientConnectionImplementation } from './mqtt-client-connection';
export abstract class MqttClientPublishingImplementation extends MqttClientConnectionImplementation {
  async publish(
    serverId: number,
    topic: string,
    message: string | Buffer,
    options?: { qos?: 0 | 1 | 2; retain?: boolean },
    completion?: { awaitAcknowledgement?: boolean; acknowledgementTimeoutSeconds?: number },
  ): Promise<void> {
    try {
      const [client, server] = await Promise.all([
        this.getOrCreateClient(serverId),
        this.mqttServerRepository.findOneBy({ id: serverId }),
      ]);

      if (!server) {
        throw new Error(`MQTT server with ID ${serverId} not found`);
      }

      const qos: 0 | 1 | 2 = (options?.qos ?? (server.defaultPublishQos as 0 | 1 | 2) ?? 0) as 0 | 1 | 2;
      const retain: boolean = options?.retain ?? Boolean(server.defaultPublishRetain ?? false);
      const startPublish = () =>
        new Promise<void>((resolve, reject) => {
          client.publish(topic, message, { qos, retain }, (error) => {
            if (error) {
              this.logger.error(`Failed to publish to topic ${topic}: ${error.message}`);
              reject(error);
            } else {
              this.logger.debug(`Published to topic ${topic}: ${message.toString()}`);
              resolve();
            }
          });
        });

      if (completion?.awaitAcknowledgement === false) {
        // The flow continues after dispatch, while the background operation still records metrics.
        void this.externalCallTimer.time('mqtt', 'publish', startPublish).catch(() => undefined);
        return;
      }

      const completionTimeout = completion?.acknowledgementTimeoutSeconds;
      return this.externalCallTimer.time('mqtt', 'publish', () => {
        const publish = startPublish();
        if (!completionTimeout) {
          return publish;
        }

        let acknowledgementTimeout: ReturnType<typeof setTimeout> | undefined;
        return Promise.race([
          publish,
          new Promise<never>((_resolve, reject) => {
            acknowledgementTimeout = setTimeout(() => {
              const error = new Error(`MQTT publish acknowledgement timed out after ${completionTimeout} seconds`);
              error.name = 'MqttAcknowledgementTimeoutError';
              reject(error);
            }, completionTimeout * 1000);
          }),
        ]).finally(() => {
          if (acknowledgementTimeout) {
            clearTimeout(acknowledgementTimeout);
          }
        });
      });
    } catch (error) {
      this.logger.error(`Failed to publish to MQTT server ${serverId}`, error);
      throw error;
    }
  }
}
