import { MqttServer } from '@attraccess/database-entities';
import * as mqtt from 'mqtt';

export interface MqttConnectionSettings {
  url: string;
  options: mqtt.IClientOptions;
  /** The caller logs the warning, so it carries the right logger context. */
  tlsVerificationDisabled: boolean;
}

/** Host, TLS and credential handling shared by every connection opened for a configured server. */
export function buildMqttConnectionSettings(
  server: MqttServer,
  password: string | null,
  overrides: Pick<mqtt.IClientOptions, 'clientId' | 'clean' | 'reconnectPeriod' | 'resubscribe'>,
): MqttConnectionSettings {
  const url = `${server.useTls ? 'mqtts' : 'mqtt'}://${server.host}:${server.port}`;
  const options: mqtt.IClientOptions = { ...overrides };
  let tlsVerificationDisabled = false;

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
      tlsVerificationDisabled = true;
    }
  }

  return { url, options, tlsVerificationDisabled };
}
