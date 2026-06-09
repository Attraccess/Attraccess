import { ResourceFlowNode, IfNodeDataSchema } from '@attraccess/database-entities';
import { get } from 'lodash-es';
import z from 'zod';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class IfExecutor implements NodeExecutor {
  async execute(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const {
      path,
      comparisonOperator,
      comparisonValue: comparisonValueTemplate,
      comparisonValueIsPath,
    } = node.data as z.infer<typeof IfNodeDataSchema>;

    const sourceValue = get(input, path, '');
    let comparisonValue = comparisonValueTemplate;

    if (comparisonValueIsPath) {
      comparisonValue = get(input, comparisonValue, '');
    }

    let result = false;
    switch (comparisonOperator) {
      case '=':
        result = String(comparisonValue) === String(sourceValue);
        break;
      case '!=':
        result = String(comparisonValue) !== String(sourceValue);
        break;
      case '>':
        result = Number(comparisonValue) > Number(sourceValue);
        break;
      case '<':
        result = Number(comparisonValue) < Number(sourceValue);
        break;
      case '>=':
        result = Number(comparisonValue) >= Number(sourceValue);
        break;
      case '<=':
        result = Number(comparisonValue) <= Number(sourceValue);
        break;
      default: {
        const exhaustiveCheck: never = comparisonOperator;
        throw new FlowExecutionError(`Unknown comparison operator: ${exhaustiveCheck}`);
      }
    }

    return {
      payload: input,
      outputHandle: result ? 'output-true' : 'output-false',
    };
  }
}
