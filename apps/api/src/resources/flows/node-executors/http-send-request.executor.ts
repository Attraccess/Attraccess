import { ResourceFlowNode, HttpRequestNodeDataSchema } from '@attraccess/database-entities';
import axios from 'axios';
import z from 'zod';
import { FlowFailureKind, NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class HttpSendRequestExecutor implements NodeExecutor {
  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const data = node.data as z.infer<typeof HttpRequestNodeDataSchema>;

    const url = ctx.compileTemplate(data.url ?? '', input);
    const method = ctx.compileTemplate(data.method ?? '', input);
    const headers = Object.fromEntries(
      Object.entries(data.headers ?? {}).map(([key, value]) => [key, ctx.compileTemplate(value, input)]),
    );
    const body = ctx.compileTemplate(data.body ?? '', input);

    const response = await axios.request({
      url,
      method,
      headers,
      data: body,
      ...(data.timeoutSeconds ? { timeout: data.timeoutSeconds * 1000 } : {}),
    });

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
