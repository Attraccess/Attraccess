// TypeORM entity for the zigbee2mqtt gateway configuration (ATT-789).
//
// Exactly one row, always `id = 1`: an Attraccess deployment talks to a single
// z2m instance. Modelled as a typed single-row table rather than a key/value
// store so the columns stay type-checked.
//
// The schema is owned by backend/migrations/*-add-zigbee-support.ts — see the
// note on shelly-device.entity.ts about `synchronize: false` and explicit
// column types.
import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

/** The only row id this table ever holds. */
export const ZIGBEE_GATEWAY_ROW_ID = 1;

@Entity({ name: 'plugin_shelly_zigbee_gateway' })
export class ZigbeeGateway {
  @PrimaryColumn({ type: 'integer' })
  id!: number;

  /**
   * Host MQTT server the z2m instance publishes to. Resolved to connection
   * details (including decrypted credentials) through
   * `PluginContext.getMqttServerConfig`, gated on ACCESS_MQTT_SERVERS.
   */
  @Column({ type: 'integer', name: 'mqtt_server_id' })
  mqttServerId!: number;

  /** z2m `mqtt.base_topic`. Defaults to z2m's own default, `zigbee2mqtt`. */
  @Column({ type: 'varchar', name: 'base_topic', default: 'zigbee2mqtt' })
  baseTopic!: string;

  @Column({ type: 'varchar', name: 'updated_at' })
  updatedAt!: string;
}
