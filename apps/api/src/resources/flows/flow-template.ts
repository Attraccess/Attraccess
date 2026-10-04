import Handlebars from 'handlebars';
import { FlowExecutionError } from './errors/flow-execution.error';

const handlebars = Handlebars.create();

handlebars.registerHelper('json', (value: unknown) => {
  try {
    return new handlebars.SafeString(JSON.stringify(value));
  } catch {
    return 'null';
  }
});

function numericOperand(value: unknown, helper: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && value.trim() === '')) {
    throw new FlowExecutionError(`Template helper "${helper}" expects finite numbers or numeric strings`);
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new FlowExecutionError(`Template helper "${helper}" expects finite numbers or numeric strings`);
  }
  return number;
}

const arithmetic: Record<string, (left: number, right: number) => number> = {
  add: (left, right) => left + right,
  subtract: (left, right) => left - right,
  multiply: (left, right) => left * right,
  divide: (left, right) => left / right,
};

for (const [helper, operation] of Object.entries(arithmetic)) {
  handlebars.registerHelper(helper, (...args: unknown[]) => {
    // Handlebars appends its options object to every helper invocation.
    const operands = args.slice(0, -1);
    if (operands.length !== 2) {
      throw new FlowExecutionError(`Template helper "${helper}" expects exactly two operands`);
    }

    const left = numericOperand(operands[0], helper);
    const right = numericOperand(operands[1], helper);
    if (helper === 'divide' && right === 0) {
      throw new FlowExecutionError('Template helper "divide" cannot divide by zero');
    }

    const result = operation(left, right);
    if (!Number.isFinite(result)) {
      throw new FlowExecutionError(`Template helper "${helper}" produced a non-finite result`);
    }
    return result;
  });
}

export function compileFlowTemplate(template: string, data: object): string {
  return handlebars.compile(template)(data);
}
