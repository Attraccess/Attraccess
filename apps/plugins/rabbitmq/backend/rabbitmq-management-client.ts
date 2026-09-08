// Thin HTTP client for the RabbitMQ management API (ATT-522).
//
// Wraps the shared transport with the conventions every management call shares: base URL
// derived from the generic MQTT config (the management API listens on its own
// port, 15672/15671 by convention), Basic auth from the MQTT server
// credentials, a request timeout, and translation of upstream failures into
// HTTP exceptions whose messages tell the operator what actually went wrong
// (unreachable broker, rejected credentials, missing management privileges, …).
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { describeManagementError, managementApiBase, managementRequest } from './rabbitmq-management-transport';

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
    return managementApiBase(config);
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
    let response: Response;
    try {
      response = await managementRequest(config, `${base}/api${path}`, method, body, REQUEST_TIMEOUT_MS);
    } catch (error) {
      throw new HttpException(describeManagementError(error, REQUEST_TIMEOUT_MS), HttpStatus.BAD_GATEWAY);
    }

    if (!response.ok) {
      throw await this.toHttpException(response);
    }

    return this.parseBody<T>(response);
  }

  // Maps an upstream error response to an exception with an actionable
  // message. Auth failures surface as 502 (not 401/403) so the host frontend
  // doesn't mistake them for an expired Attraccess session.
  private async toHttpException(response: Response): Promise<HttpException> {
    const upstream = await this.parseErrorBody(response);
    const reason =
      typeof upstream?.reason === 'string'
        ? upstream.reason
        : typeof upstream?.error === 'string'
          ? upstream.error
          : '';

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
          '. User management requires a user with the "administrator" tag.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (response.status === 404) {
      return new HttpException('Not found on the RabbitMQ side.', HttpStatus.NOT_FOUND);
    }

    if (response.status === 400) {
      return new HttpException(
        'RabbitMQ rejected the request. Check the supplied management parameters.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return new HttpException(
      `RabbitMQ management API request failed (HTTP ${response.status}).`,
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
}
