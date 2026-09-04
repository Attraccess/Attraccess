// Thin HTTP client for the RabbitMQ management API (ATT-522).
//
// Wraps fetch with the conventions every management call shares: base URL
// derived from the generic MQTT config (the management API listens on its own
// port, 15672/15671 by convention), Basic auth from the MQTT server
// credentials, a request timeout, and translation of upstream failures into
// HTTP exceptions whose messages tell the operator what actually went wrong
// (unreachable broker, rejected credentials, missing management privileges, …).
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const MGMT_PORT_HTTP = 15672;
const MGMT_PORT_HTTPS = 15671;

// Management operations are quick; a broker that takes longer than this is
// treated as unreachable instead of stalling the request.
const REQUEST_TIMEOUT_MS = 10_000;

// RabbitMQ error envelope: failures answer `{"error": "...", "reason": "..."}`.
interface RabbitmqErrorBody {
  error?: string;
  reason?: string;
}

@Injectable()
export class RabbitmqManagementClient {
  // Builds the management API base URL from the generic MQTT config (same
  // convention as RabbitmqDetectionService).
  managementApiBase(config: MqttServerConnectionConfig): string {
    const scheme = config.useTls ? 'https' : 'http';
    const port = config.useTls ? MGMT_PORT_HTTPS : MGMT_PORT_HTTP;
    return `${scheme}://${config.host}:${port}`;
  }

  // Performs one management API request. `path` is relative to `/api`, with
  // every variable segment already URL-encoded by the caller. Returns the
  // parsed JSON body (or null for empty responses, e.g. 201/204).
  async request<T>(
    config: MqttServerConnectionConfig,
    method: 'GET' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const base = this.managementApiBase(config);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${base}/api${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...this.authHeader(config),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      throw new HttpException(
        `Cannot reach the RabbitMQ management API at ${base}: ${this.describeNetworkError(error)}`,
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw await this.toHttpException(response);
    }

    return this.parseBody<T>(response);
  }

  private authHeader(config: MqttServerConnectionConfig): Record<string, string> {
    if (config.username === null) {
      return {};
    }
    const credentials = `${config.username}:${config.password ?? ''}`;
    const encoded = Buffer.from(credentials, 'utf8').toString('base64');
    return { authorization: `Basic ${encoded}` };
  }

  // Maps an upstream error response to an exception with an actionable
  // message. Auth failures surface as 502 (not 401/403) so the host frontend
  // doesn't mistake them for an expired Attraccess session.
  private async toHttpException(response: Response): Promise<HttpException> {
    const upstream = await this.parseErrorBody(response);
    const reason = upstream?.reason || upstream?.error || '';

    if (response.status === 401) {
      return new HttpException(
        'The RabbitMQ management API rejected the configured MQTT server credentials (401). ' +
          'Check the username/password configured for this MQTT server.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (response.status === 403 || /not.?authori[sz]ed/i.test(reason)) {
      return new HttpException(
        'The configured MQTT server user lacks management privileges on RabbitMQ' +
          (reason ? ` (${reason})` : '') +
          '. User management requires a user with the "administrator" tag.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (response.status === 404) {
      return new HttpException(`Not found on the RabbitMQ side${reason ? `: ${reason}` : '.'}`, HttpStatus.NOT_FOUND);
    }

    if (response.status === 400) {
      return new HttpException(`RabbitMQ rejected the request${reason ? `: ${reason}` : '.'}`, HttpStatus.BAD_REQUEST);
    }

    return new HttpException(
      `RabbitMQ management API request failed (HTTP ${response.status})${reason ? `: ${reason}` : '.'}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private async parseBody<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (text.length === 0) {
      return null as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpException(
        'The RabbitMQ management API returned a response that is not valid JSON.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async parseErrorBody(response: Response): Promise<RabbitmqErrorBody | null> {
    try {
      return (await response.json()) as RabbitmqErrorBody;
    } catch {
      return null;
    }
  }

  private describeNetworkError(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return `no response within ${REQUEST_TIMEOUT_MS}ms`;
      }
      // Node's fetch wraps the interesting part (ECONNREFUSED etc.) in `cause`.
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof Error && cause.message) {
        return cause.message;
      }
      return error.message;
    }
    return 'unknown network error';
  }
}
