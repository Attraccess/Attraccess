import { MqttClientPublishingImplementation } from './mqtt-client-publishing';
import { SubscriptionQos, TopicSubscription } from './mqtt-client.service.route-context';
export abstract class MqttClientSubscriptionsImplementation extends MqttClientPublishingImplementation {
  async subscribe(serverId: number, topic: string, qos?: 0 | 1 | 2, requireAcknowledgement = false): Promise<void> {
    // Track desired subscriptions so they can be (re)applied on connect/reconnect
    if (!this.subscriptions.has(serverId)) {
      this.subscriptions.set(serverId, new Map());
    }
    const serverTopics = this.subscriptions.get(serverId);
    const existingSubscription = serverTopics.get(topic);
    if (existingSubscription) {
      existingSubscription.qosCounts.set(qos, (existingSubscription.qosCounts.get(qos) ?? 0) + 1);
    } else {
      serverTopics.set(topic, { qosCounts: new Map([[qos, 1]]) });
    }

    try {
      await this.reconcileSubscription(serverId, topic, true);
    } catch (error) {
      if (requireAcknowledgement) {
        throw error;
      }
      // The client will keep trying to connect and will subscribe on next connect.
      this.logger.warn(
        `Will subscribe to topic ${topic} for server ${serverId} once connection is available: ${error?.message ?? error}`,
      );
    }
  }

  async unsubscribe(serverId: number, topic: string, qos?: SubscriptionQos): Promise<void> {
    const topics = this.subscriptions.get(serverId);
    const subscription = topics?.get(topic);
    if (!subscription) {
      return;
    }
    const qosCount = subscription.qosCounts.get(qos);
    if (!qosCount) {
      return;
    }
    const client = this.clients.get(serverId);
    if (qosCount === 1) {
      subscription.qosCounts.delete(qos);
    } else {
      subscription.qosCounts.set(qos, qosCount - 1);
    }

    if (subscription.qosCounts.size === 0) {
      topics.delete(topic);
      if (topics.size === 0) {
        this.subscriptions.delete(serverId);
      }
    }

    // A pending subscribe operation will see the updated desired state.
    if (!client?.connected) {
      return;
    }

    await this.reconcileSubscription(serverId, topic, false);
  }

  /** Serializes broker changes so the last desired QoS always wins. */
  protected reconcileSubscription(serverId: number, topic: string, connect: boolean): Promise<void> {
    const operations = this.subscriptionOperations.get(serverId) ?? new Map<string, Promise<void>>();
    this.subscriptionOperations.set(serverId, operations);
    const previous = operations.get(topic) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const version = this.connectionVersions.get(serverId) ?? 0;
        const subscription = this.subscriptions.get(serverId)?.get(topic);
        const client = connect ? await this.getOrCreateClient(serverId, true) : this.clients.get(serverId);

        if (!subscription) {
          if (!client?.connected) {
            return;
          }
          await new Promise<void>((resolve, reject) => {
            client.unsubscribe(topic, (error) => (error ? reject(error) : resolve()));
          });
          return;
        }

        const server = await this.mqttServerRepository.findOneBy({ id: serverId });
        // State may have changed while resolving the server or opening a connection.
        if (this.subscriptions.get(serverId)?.get(topic) !== subscription) {
          return;
        }
        const effectiveQos = this.effectiveQos(subscription, server?.defaultSubscribeQos as SubscriptionQos);
        if (subscription.effectiveQos === effectiveQos || !client?.connected) {
          return;
        }
        await this.externalCallTimer.time(
          'mqtt',
          'subscribe',
          () =>
            new Promise<void>((resolve, reject) => {
              client.subscribe(topic, { qos: effectiveQos }, (error) => (error ? reject(error) : resolve()));
            }),
        );
        if (version === (this.connectionVersions.get(serverId) ?? 0)) subscription.effectiveQos = effectiveQos;
      });
    operations.set(topic, operation);
    void operation
      .finally(() => {
        if (operations.get(topic) !== operation) {
          return;
        }
        operations.delete(topic);
        if (operations.size === 0) {
          this.subscriptionOperations.delete(serverId);
        }
      })
      .catch(() => undefined);
    return operation;
  }

  protected effectiveQos(subscription: TopicSubscription, defaultQos?: SubscriptionQos): SubscriptionQos {
    return Math.max(
      ...Array.from(subscription.qosCounts.entries(), ([qos, count]) => (count > 0 ? (qos ?? defaultQos ?? 0) : 0)),
    ) as SubscriptionQos;
  }
}
