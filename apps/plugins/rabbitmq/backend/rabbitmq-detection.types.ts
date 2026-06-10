// Shared types for RabbitMQ detection (ATT-521).
//
// Detection answers one question for a given MQTT server: "is the broker behind
// this MQTT config a RabbitMQ instance, and if so, is its management API
// reachable with the configured credentials?" No management actions yet — this
// is status only.

export interface RabbitmqDetectionResult {
  // The host MQTT server this result describes.
  readonly mqttServerId: number;
  // True when the probed host exposes a RabbitMQ management API (recognised
  // either by a successful /api/overview response or by a 401 from that
  // RabbitMQ-specific path).
  readonly isRabbitMQ: boolean;
  // The management API answered at all (any HTTP status). False on
  // connection-refused / DNS / timeout.
  readonly reachable: boolean;
  // The configured credentials were accepted by the management API.
  readonly authOk: boolean;
  // Broker version reported by /api/overview, when readable.
  readonly rabbitmqVersion: string | null;
  // Management plugin version reported by /api/overview, when readable.
  readonly managementVersion: string | null;
  // The management API base URL that was probed (never carries credentials).
  readonly managementApi: string;
  // ISO timestamp of when this probe ran.
  readonly checkedAt: string;
  // Human-readable failure reason when reachable is false, else null.
  readonly error: string | null;
}
