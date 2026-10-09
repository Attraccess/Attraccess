import Handlebars from 'handlebars';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { scaleDecimal } from './decimal-scale';

const handlebars = Handlebars.create();

function templateOperand(value: unknown): unknown {
  return value instanceof handlebars.SafeString ? value.toString() : value;
}

handlebars.registerHelper('json', (value: unknown) => {
  try {
    return new handlebars.SafeString(JSON.stringify(templateOperand(value)));
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
  handlebars.registerHelper(helper, function (this: object, ...args: unknown[]) {
    // Handlebars appends its options object to every helper invocation.
    const operands = args.slice(0, -1).map(templateOperand);
    const options = args[args.length - 1] as Handlebars.HelperOptions & {
      lookupProperty: (context: object, property: string) => unknown;
    };
    if (operands.length === 0 && Object.keys(options.hash).length === 0) {
      // Bare expressions must still resolve fields whose names match a helper.
      const value = options.lookupProperty(this, helper);
      const resolved = typeof value === 'function' ? value.call(this) : value;
      return options.fn ? handlebars.helpers.blockHelperMissing.call(this, resolved, options) : resolved;
    }
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

// These helpers transform ordinary flow values; conversion mappings belong to the flow itself.
type TransformationOptions = Handlebars.HelperOptions & {
  lookupProperty: (context: object, property: string) => unknown;
};
const transformations: Record<string, (values: unknown[], options: TransformationOptions, context: object) => unknown> =
  {
    render: ([template], options, context) => {
      if (typeof template !== 'string') throw new FlowExecutionError('render expects a template string');
      return new handlebars.SafeString(handlebars.compile(template)(context, { data: options.data }));
    },
    mapValue: ([value, mapping], options) => {
      let values: unknown = mapping;
      if (typeof mapping === 'string') {
        try {
          values = JSON.parse(mapping);
        } catch {
          throw new FlowExecutionError('mapValue expects a JSON object');
        }
      }
      if (!values || typeof values !== 'object' || Array.isArray(values))
        throw new FlowExecutionError('mapValue expects a JSON object');
      const key = String(value ?? '').trim();
      const candidates = options.hash.foldCase ? [key, key.toLowerCase()] : [key];
      for (const candidate of candidates) {
        if (Object.prototype.hasOwnProperty.call(values, candidate))
          return (values as Record<string, unknown>)[candidate];
      }
      throw new FlowExecutionError(`mapValue has no mapping for "${key}"`);
    },
    scaleDecimal: ([value, factor], options) =>
      scaleDecimal(value, factor, options.hash.precision ?? 9, options.hash.min),
  };

for (const [helper, transform] of Object.entries(transformations)) {
  handlebars.registerHelper(helper, function (this: object, ...args: unknown[]) {
    const operands = args.slice(0, -1).map(templateOperand);
    const options = args[args.length - 1] as TransformationOptions;
    if (!operands.length && !Object.keys(options.hash).length) {
      // Preserve payload fields whose names happen to match a helper.
      const value = options.lookupProperty?.(this, helper);
      const resolved = typeof value === 'function' ? value.call(this) : value;
      return options.fn ? handlebars.helpers.blockHelperMissing.call(this, resolved, options) : resolved;
    }
    if (operands.length !== (helper === 'render' ? 1 : 2))
      throw new FlowExecutionError(`Template helper "${helper}" received the wrong number of operands`);
    return transform(operands, options, this);
  });
}

export function compileFlowTemplate(template: string, data: object): string {
  return handlebars.compile(template)(data);
}
