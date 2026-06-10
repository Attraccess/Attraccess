// Shared types for the RabbitMQ connections viewer (ATT-523).
//
// One snapshot answers: "who is connected to the broker behind this MQTT
// server right now?" Each connection is mapped from RabbitMQ's
// GET /api/connections to the subset of attributes the UI shows — identity
// (client id, user, peer), transport (protocol, TLS, state) and traffic
// (totals + current rates).

export interface RabbitmqConnection {
  // RabbitMQ's unique connection name (e.g. "10.0.0.5:52431 -> 10.0.0.2:1883").
  // Doubles as the handle for force-closing the connection.
  readonly name: string;
  // MQTT client id from the connection's client_properties, when present.
  readonly clientId: string | null;
  // Broker user the connection authenticated as.
  readonly user: string | null;
  readonly vhost: string | null;
  readonly peerHost: string | null;
  readonly peerPort: number | null;
  // Protocol as reported by the broker, e.g. "MQTT 3.1.1" or "AMQP 0-9-1".
  readonly protocol: string | null;
  // Connection state as reported by the broker, e.g. "running" / "blocked".
  readonly state: string | null;
  readonly ssl: boolean;
  // Number of channels (AMQP); MQTT connections usually report 0/absent.
  readonly channels: number | null;
  // ISO timestamp the broker reports as connection start, when present.
  readonly connectedAt: string | null;
  // Total bytes received from / sent to the peer.
  readonly recvBytes: number | null;
  readonly sendBytes: number | null;
  // Current rates in bytes/s, when the broker reports them.
  readonly recvRate: number | null;
  readonly sendRate: number | null;
}

export interface RabbitmqConnectionsResult {
  readonly mqttServerId: number;
  // The listing succeeded; `connections` is meaningful.
  readonly ok: boolean;
  readonly connections: RabbitmqConnection[];
  // ISO timestamp of when this snapshot was taken.
  readonly checkedAt: string;
  // Human-readable failure reason when ok is false, else null.
  readonly error: string | null;
}

export interface RabbitmqCloseConnectionResult {
  readonly mqttServerId: number;
  readonly name: string;
  readonly closed: boolean;
  // Human-readable failure reason when closed is false, else null.
  readonly error: string | null;
}
