import { EmailTemplateType } from '@attraccess/database-entities';
import { EMAIL_TEMPLATE_DEFAULTS, readDefaultTemplateBody } from './email-defaults';
import { assertRenderableTemplate } from './template-syntax';

describe('assertRenderableTemplate', () => {
  it.each(Object.values(EmailTemplateType))('accepts the shipped default of %s', (type) => {
    expect(() =>
      assertRenderableTemplate({ subject: EMAIL_TEMPLATE_DEFAULTS[type].subject, body: readDefaultTemplateBody(type) }),
    ).not.toThrow();
  });

  it('names what the parser expected, not only where it failed', () => {
    expect(() => assertRenderableTemplate({ subject: '{{#if x}}broken' })).toThrow(
      /Parse error on line 1: Expecting .*got 'EOF'/,
    );
  });

  it('ignores the parts that are not part of the edit', () => {
    expect(() => assertRenderableTemplate({})).not.toThrow();
    expect(() => assertRenderableTemplate({ subject: 'Only a subject' })).not.toThrow();
  });
});
