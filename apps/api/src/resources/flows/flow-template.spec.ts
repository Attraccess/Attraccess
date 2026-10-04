import Handlebars from 'handlebars';
import { FlowExecutionError } from './errors/flow-execution.error';
import { compileFlowTemplate } from './flow-template';

describe('flow templates', () => {
  it.each([
    ['{{add 2 3}}', '5'],
    ['{{subtract 2 3}}', '-1'],
    ['{{multiply -2 3.5}}', '-7'],
    ['{{divide 3 2}}', '1.5'],
    ['{{multiply 0 5}}', '0'],
  ])('renders arithmetic with %s', (template, expected) => {
    expect(compileFlowTemplate(template, {})).toBe(expected);
  });

  it('converts watt-hours to kilowatt-hours using a numeric string from the payload', () => {
    expect(compileFlowTemplate('{{divide payload.energy_wh 1000}}', { payload: { energy_wh: ' 1500 ' } })).toBe('1.5');
  });

  it('nests arithmetic for temperature conversion with stored variables', () => {
    expect(
      compileFlowTemplate('{{add (divide (multiply payload.temperature 9) 5) variables.global.offset}}', {
        payload: { temperature: '20' },
        variables: { global: { offset: 32 } },
      }),
    ).toBe('68');
  });

  it('serializes a computed result as a JSON number', () => {
    const result = compileFlowTemplate('{ "energy_kwh": {{json (divide payload.energy_wh 1000)}} }', {
      payload: { energy_wh: 1500 },
    });
    expect(JSON.parse(result)).toEqual({ energy_kwh: 1.5 });
  });

  it('keeps interpolation, HTML escaping, built-in helpers and the json helper working', () => {
    expect(compileFlowTemplate('{{#if ready}}{{name}}{{/if}}', { ready: true, name: 'A & B' })).toBe('A &amp; B');
    expect(compileFlowTemplate('{{json payload}}', { payload: { name: 'A "B"', values: [1, null] } })).toBe(
      '{"name":"A \\"B\\"","values":[1,null]}',
    );
  });

  it.each(['add', 'subtract', 'multiply', 'divide'])('requires exactly two operands for %s', (helper) => {
    for (const operands of ['1', '1 2 3']) {
      expect(() => compileFlowTemplate(`{{${helper} ${operands}}}`, {})).toThrow(
        `Template helper "${helper}" expects exactly two operands`,
      );
    }
  });

  it.each(['add', 'subtract', 'multiply', 'divide'])('preserves field lookup for a bare %s expression', (field) => {
    for (const value of ['A & B', 0, false, null, undefined, () => 'computed']) {
      const data = { [field]: value };
      const template = `{{${field}}}`;
      expect(compileFlowTemplate(template, data)).toBe(Handlebars.compile(template)(data));
    }
    expect(compileFlowTemplate(`{{${field}}}`, {})).toBe('');
    expect(compileFlowTemplate(`{{#with payload}}{{${field}}}{{/with}}`, { payload: { [field]: 'nested' } })).toBe(
      'nested',
    );
    for (const value of [true, false, 'text', ['one', 'two'], { name: 'value' }]) {
      const data = { [field]: value };
      const template = `{{#${field}}}{{this}}{{else}}missing{{/${field}}}`;
      expect(compileFlowTemplate(template, data)).toBe(Handlebars.compile(template)(data));
    }
  });

  it.each([undefined, null, true, false, '', '   ', '12foo', '1,5', 'Infinity', NaN, Infinity, [], {}, new Number(2)])(
    'rejects a nonnumeric operand %p',
    (value) => {
      expect(() => compileFlowTemplate('{{add value 1}}', { value })).toThrow(FlowExecutionError);
      expect(() => compileFlowTemplate('{{divide 1 value}}', { value })).toThrow(
        'expects finite numbers or numeric strings',
      );
    },
  );

  it.each([0, -0, '0', '-0'])('rejects division by zero (%p)', (zero) => {
    expect(() => compileFlowTemplate('{{divide 1 zero}}', { zero })).toThrow('cannot divide by zero');
  });

  it('rejects an overflow instead of rendering Infinity', () => {
    expect(() => compileFlowTemplate('{{multiply value 2}}', { value: Number.MAX_VALUE })).toThrow(
      'produced a non-finite result',
    );
  });

  it('does not register flow helpers in the global Handlebars environment', () => {
    expect(Handlebars.helpers.add).toBeUndefined();
    expect(Handlebars.helpers.divide).toBeUndefined();
  });

  it.each([
    ['{{scaleDecimal value "1/1000"}}', '9007199254740993.123456789', '9007199254740.993123457'],
    ['{{scaleDecimal value "1/9"}}', '1', '0.111111111'],
    ['{{scaleDecimal value "1" precision=2}}', '-1.235', '-1.24'],
  ])('scales decimal strings exactly (%s)', (template, value, expected) => {
    expect(compileFlowTemplate(template, { value })).toBe(expected);
  });

  it('renders nested templates and maps user-defined values without interpreting units', () => {
    expect(
      compileFlowTemplate(
        '{{scaleDecimal (render "{{#if ready}}{{count}}{{else}}0{{/if}}") (mapValue kind \'{"box":"12","bag":"3"}\' foldCase=true)}}',
        {
          ready: true,
          count: '2',
          kind: ' BOX ',
        },
      ),
    ).toBe('24');
    expect(() => compileFlowTemplate('{{mapValue kind \'{"box":"12"}\'}}', { kind: 'missing' })).toThrow('no mapping');
  });

  it('escapes nested rendered values once while preserving explicitly rendered markup', () => {
    const data = { name: '<script>A & B</script>' };
    expect(compileFlowTemplate('{{render "{{name}}"}}', data)).toBe(compileFlowTemplate('{{name}}', data));
    expect(compileFlowTemplate('{{render "<strong>{{name}}</strong>"}}', data)).toBe(
      '<strong>&lt;script&gt;A &amp; B&lt;/script&gt;</strong>',
    );
    expect(compileFlowTemplate('{{json (render "{{name}}")}}', data)).toBe(
      JSON.stringify(compileFlowTemplate('{{name}}', data)),
    );
    expect(compileFlowTemplate('{{add (render "{{count}}") 1}}', { count: 2 })).toBe('3');
  });

  it.each(['{{scaleDecimal value "1/0"}}', '{{scaleDecimal value "bad"}}', '{{scaleDecimal value "1" precision=99}}'])(
    'rejects invalid scaling (%s)',
    (template) => {
      expect(() => compileFlowTemplate(template, { value: '1' })).toThrow(FlowExecutionError);
    },
  );

  it.each(['scaleDecimal', 'render', 'mapValue'])('preserves a bare payload field named %s', (field) => {
    expect(compileFlowTemplate(`{{${field}}}`, { [field]: 'value' })).toBe('value');
  });
});
