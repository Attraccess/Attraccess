import { FlowExecutionEngineProcessNodeOperation } from './flow-execution-engine.flow-execution-engine-process-node-operation';
export abstract class FlowExecutionEngineErrorReasonOperation extends FlowExecutionEngineProcessNodeOperation {
  protected errorReason(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }

    if (typeof error === 'string') {
      return error || 'Unknown error';
    }

    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message || 'Unknown error';
    }

    try {
      const serialized = JSON.stringify(error);
      return serialized && serialized !== '{}' ? serialized : 'Unknown error';
    } catch {
      return String(error);
    }
  }
}
