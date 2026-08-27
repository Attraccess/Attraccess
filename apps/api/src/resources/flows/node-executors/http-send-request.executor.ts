import { Logger } from '@nestjs/common';
import { ResourceFlowNode, HttpRequestNodeDataSchema } from '@attraccess/database-entities';
import axios from 'axios';
import z from 'zod';
import { FlowFailureKind, NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

const DEFAULT_DISPATCH_TIMEOUT_MS = 30_000;

export class HttpSendRequestExecutor implements NodeExecutor {
  private readonly logger = new Logger(HttpSendRequestExecutor.name);

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const data = node.data as z.infer<typeof HttpRequestNodeDataSchema>;

    const url = ctx.compileTemplate(data.url ?? '', input);
    const method = ctx.compileTemplate(data.method ?? '', input);
    const headers = Object.fromEntries(
      Object.entries(data.headers ?? {}).map(([key, value]) => [key, ctx.compileTemplate(value, input)]),
    );
    const body = ctx.compileTemplate(data.body ?? '', input);
    const timeout =
      data.timeoutSeconds !== undefined
        ? data.timeoutSeconds * 1000
        : data.completionBehavior === 'dispatch'
          ? DEFAULT_DISPATCH_TIMEOUT_MS
          : undefined;

    const request = axios.request({
      url,
      method,
      headers,
      data: body,
      ...(timeout !== undefined ? { timeout } : {}),
    });

    if (data.completionBehavior === 'dispatch') {
      // Dispatch failures cannot affect a flow that has already continued.
      void request.catch((error: unknown) => this.logger.error(`HTTP request dispatch failed: ${url}`, error));
      return { payload: input };
    }

    const response = await request;

    return {
      payload: response.data,
    };
  }

  getFailureKind(error: unknown): FlowFailureKind {
    if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
      return 'acknowledgement-timeout';
    }

    return typeof error === 'object' && error !== null && 'response' in error
      ? 'controller-rejection'
      : 'transport-dispatch';
  }
}
