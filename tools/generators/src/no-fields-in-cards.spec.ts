import { registerComponentCases } from './card-field-components.test-utils';
import { registerWrapperAndCycleCases } from './card-field-cycles.test-utils';
import { registerExpressionCases } from './card-field-expressions.test-utils';

describe('form fields are not wrapped in Cards (ATT-294 / ATT-834)', () => {
  registerComponentCases();
  registerExpressionCases();
  registerWrapperAndCycleCases();
});
