import { ResourceFlowNode, HttpRequestNodeDataSchema } from '@attraccess/database-entities';
import axios from 'axios';
import z from 'zod';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

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
    });

    return {
      payload: response.data,
    };
  }
}
