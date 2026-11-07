import { EmailTemplateType } from '@attraccess/database-entities';
import { EMAIL_TEMPLATE_DEFAULTS, readDefaultTemplateBody } from './email-defaults';
import { BadRequestException } from '@nestjs/common';
import { assertRenderableTemplate, checkTemplateSyntax, TemplateSyntaxError } from './template-syntax';

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

  it.each([
    ['a partial', '{{> footer}}'],
    ['a partial block', '{{#> layout}}x{{/layout}}'],
    ['a decorator', '{{* deco}}'],
    ['an inline partial (decorator block)', '{{#*inline "x"}}y{{/inline}}'],
    ['a nested partial', '{{#if a}}{{#each b}}{{> row}}{{/each}}{{/if}}'],
  ])('rejects %s with a 400, since the send pipeline registers none', (_name, source) => {
    expect(() => assertRenderableTemplate({ subject: source })).toThrow(BadRequestException);
    expect(() => assertRenderableTemplate({ subject: source })).toThrow(/partials and decorators are not supported/);
  });

  it('reports unknown helpers and syntax errors as a plain error outside the admin API', () => {
    expect(() => checkTemplateSyntax('Body', '{{shout name}}')).toThrow(TemplateSyntaxError);
    expect(() => checkTemplateSyntax('Body', '{{#if x}}')).toThrow(/^Body is not a valid template: Parse error/);
    expect(() => checkTemplateSyntax('Body', '{{#if x}}{{t "k" "Hi {n}" n=user.name}}{{/if}}')).not.toThrow();
  });
});
