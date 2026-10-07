import { MqttServer } from '@attraccess/database-entities';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { SubscriptionQos } from './mqtt-client.service.route-context';
import { MqttClientServiceRouteContext } from './mqtt-client.service.route-context';
import { MqttMessageEvent } from './mqtt-message.event';
export abstract class MqttClientConnectionImplementation extends MqttClientServiceRouteContext {
  protected async createClient(serverId: number, keepTryingToConnect = false): Promise<MqttClient> {
    const version = this.connectionVersions.get(serverId) ?? 0;
    const server = await this.mqttServerRepository.findOneBy({ id: serverId });

    if (!server) {
      throw new Error(`MQTT server with ID ${serverId} not found`);
    }
    const password = await this.resolveServerPassword(server);
    if (this.destroyed || version !== (this.connectionVersions.get(serverId) ?? 0))
      throw new Error('MQTT connection was replaced');

    return new Promise((resolve, reject) => {
      const url = `${server.useTls ? 'mqtts' : 'mqtt'}://${server.host}:${server.port}`;

      const options: mqtt.IClientOptions = {
        clientId: server.clientId || `attraccess-client`,
        clean: true,
        reconnectPeriod: 5000,
      };

      if (server.username) {
        options.username = server.username;
      }

      if (password) {
        options.password = password;
      }

      if (server.useTls) {
        if (server.caCert) {
          options.ca = server.caCert;
        }
        if (server.tlsServername) {
          options.servername = server.tlsServername;
        }
        if (server.tlsInsecure) {
          options.rejectUnauthorized = false;
          this.logger.warn(
            `TLS certificate verification is disabled for MQTT server ${server.name} (${url}) - connection is not protected against man-in-the-middle attacks`,
          );
        }
      }

      const client = mqtt.connect(url, options);
      let active = true;
      const cancellations = this.connectionCancellations.get(serverId) ?? new Set<() => void>();
      this.connectionCancellations.set(serverId, cancellations);
      const cancel = () => {
        if (!active) return;
        active = false;
        clearTimeout(timeout);
        cancellations.delete(cancel);
        client.end(true);
        reject(new Error('MQTT connection was replaced'));
      };
      cancellations.add(cancel);

      client.on('message', (topic, payloadBuffer) => {
        if (!active) return;
        const payloadString = payloadBuffer.toString();
        let payload = payloadString;
        try {
          payload = JSON.parse(payloadString);
        } catch {
          // propably not json, just ignore it
        }
        this.logger.debug(`mqtt message: ${topic}: ${payloadString}`);

        this.eventEmitter.emit(
          MqttMessageEvent.EVENT_NAME,
          new MqttMessageEvent(serverId, topic, payload, payloadBuffer),
        );
      });

      client.on('connect', () => {
        if (!active) return;
        this.logger.log(`Connected to MQTT server ${server.name} (${url})`);
        this.clients.set(serverId, client);
        this.updateHealthyServerCount();
        // Re-subscribe to all known topics for this server on each successful connect
        const topics = this.subscriptions.get(serverId);
        if (topics && topics.size > 0) {
          for (const [t, subscription] of topics.entries()) {
            // A broker connection has no active subscriptions until this request succeeds.
            subscription.effectiveQos = undefined;
            const effectiveQos = this.effectiveQos(subscription, server.defaultSubscribeQos as SubscriptionQos);
            client.subscribe(t, { qos: effectiveQos }, (err) => {
              if (!active) return;
              if (err) {
                this.logger.warn(`Failed to (re)subscribe to ${t} on server ${server.name}: ${err.message}`);
                return;
              }
              if (this.subscriptions.get(serverId)?.get(t) !== subscription) {
                return;
              }
              if (this.effectiveQos(subscription, server.defaultSubscribeQos as SubscriptionQos) === effectiveQos) {
                subscription.effectiveQos = effectiveQos;
              } else {
                void this.reconcileSubscription(serverId, t, true).catch((error) => {
                  this.logger.warn(
                    `Failed to reconcile MQTT subscription ${t} on server ${server.name}: ${error.message}`,
                  );
                });
              }
            });
            this.logger.debug(`(re)subscribed to ${t} on server ${server.name} with qos=${effectiveQos}`);
          }
        }
        resolve(client);
      });

      client.on('error', (error) => {
        if (!active) return;
        this.logger.error(`MQTT connection error for server ${server.name} (${url}): ${error.message}`);
        this.updateHealthyServerCount();
      });

      client.on('reconnect', () => {
        if (!active) return;
        this.logger.log(`Reconnecting to MQTT server ${server.name}`);
      });

      client.on('disconnect', () => {
        if (!active) return;
        this.logger.log(`Disconnected from MQTT server ${server.name}`);
      });

      client.on('offline', () => {
        if (!active) return;
        this.logger.log(`MQTT client for server ${server.name} is offline`);
        this.updateHealthyServerCount();
      });

      // Reject after 10 seconds if connection hasn't been established
      const timeout = setTimeout(() => {
        if (!client.connected) {
          const errorMsg = `Timeout connecting to MQTT server ${server.name}`;
          reject(new Error(errorMsg));
          if (!keepTryingToConnect) {
            cancel();
          }
        }
      }, 10000);

      // Clear timeout when connected
      client.once('connect', () => {
        clearTimeout(timeout);
      });
    });
  }

  protected updateHealthyServerCount(): void {
    const healthyCount = Array.from(this.clients.values()).filter((c) => c.connected).length;
    this.metricsService.mqttServersHealthy.set(healthyCount);
  }

  protected async resolveServerPassword(server: MqttServer): Promise<string | null> {
    if (!server.password) {
      return null;
    }

    if (this.encryptionService.isEncrypted(server.password)) {
      return this.encryptionService.decrypt(server.password);
    }

    const plaintext = server.password;
    const encrypted = this.encryptionService.encrypt(plaintext);
    await this.mqttServerRepository.update(server.id, { password: encrypted });
    return plaintext;
  }
}
