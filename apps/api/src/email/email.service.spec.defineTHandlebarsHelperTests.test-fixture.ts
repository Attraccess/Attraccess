import { EmailTemplateType } from '@attraccess/database-entities';
import { registerTHandlebarsHelperInterpolatesVarPlaceholdersFromHashArgsUsingTheDefaultValue } from './email.service.t-handlebars-helper-interpolates-var-placeholders-from-hash-args-using-the-default-value.test-cases';
import { registerTHandlebarsHelperUsesDbTranslationOverDefaultAndStillInterpolatesVar } from './email.service.t-handlebars-helper-uses-db-translation-over-default-and-still-interpolates-var.test-cases';
import { registerTHandlebarsHelperLeavesUnresolvedVarLiteralsIntactWhenHashArgIsMissing } from './email.service.t-handlebars-helper-leaves-unresolved-var-literals-intact-when-hash-arg-is-missing.test-cases';
import { registerTHandlebarsHelperEscapesHtmlDangerousCharactersInInterpolatedValues } from './email.service.t-handlebars-helper-escapes-html-dangerous-characters-in-interpolated-values.test-cases';
import { registerTHandlebarsHelperDoesNotDoubleEscapeHtmlTagsPresentInTheTranslationStringItself } from './email.service.t-handlebars-helper-does-not-double-escape-html-tags-present-in-the-translation-string-itself.test-cases';
import { registerTHandlebarsHelperDoesNotCrashWhenCalledWithOneArgNoDefaultValue } from './email.service.t-handlebars-helper-does-not-crash-when-called-with-one-arg-no-default-value.test-cases';
import { registerTHandlebarsHelperFallsBackToDefaultWhenDbTranslationIsAnEmptyString } from './email.service.t-handlebars-helper-falls-back-to-default-when-db-translation-is-an-empty-string.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { EmailServiceTestScope } from './email.service.spec';

export function defineTHandlebarsHelperTests(parentScope: EmailServiceTestScope) {
  const setupT = (translationsMap: Record<string, string> = {}, templateBody?: string) => {
    const base = parentScope.setup();
    const body =
      templateBody ??
      '<mjml><mj-body><mj-section><mj-column>' +
        "<mj-text>{{t 'greeting' 'Hello {name}!' name=user.username}}</mj-text>" +
        '</mj-column></mj-section></mj-body></mjml>';

    base.emailTemplateService.findOne.mockImplementation((type: EmailTemplateType) => {
      if (type === EmailTemplateType.VERIFY_EMAIL) {
        return Promise.resolve({ type, subject: 'Test', body });
      }
      return Promise.reject(new Error('Unexpected template type'));
    });
    base.emailTemplateService.getTranslationsMap.mockResolvedValue(translationsMap);
    return base;
  };
  const scope = inheritTestScope(
    {
      get setupT() {
        return setupT;
      },
      get makeUser() {
        return parentScope.makeUser;
      },
    },
    parentScope,
  );

  registerTHandlebarsHelperInterpolatesVarPlaceholdersFromHashArgsUsingTheDefaultValue(scope);

  registerTHandlebarsHelperUsesDbTranslationOverDefaultAndStillInterpolatesVar(scope);

  registerTHandlebarsHelperLeavesUnresolvedVarLiteralsIntactWhenHashArgIsMissing(scope);

  registerTHandlebarsHelperEscapesHtmlDangerousCharactersInInterpolatedValues(scope);

  registerTHandlebarsHelperDoesNotDoubleEscapeHtmlTagsPresentInTheTranslationStringItself(scope);

  registerTHandlebarsHelperDoesNotCrashWhenCalledWithOneArgNoDefaultValue(scope);

  registerTHandlebarsHelperFallsBackToDefaultWhenDbTranslationIsAnEmptyString(scope);

  return scope;
}
