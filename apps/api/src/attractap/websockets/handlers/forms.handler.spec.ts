import { registerAttractapFormsHandlerFixture } from './forms.handler.attractap-forms-handler.test-fixture';
import { registerFormDraftKeyCases } from './forms.handler.attractap-forms-handler.clear-form-draft.behaviors.test-cases';
import { registerGetFormDraftCases } from './forms.handler.attractap-forms-handler.clear-form-draft.behaviors.test-cases';
import { registerClearFormDraftCases } from './forms.handler.attractap-forms-handler.clear-form-draft.behaviors.test-cases';
import { registerHandleResourceUsageFormCancelCases } from './forms.handler.attractap-forms-handler.clear-form-draft.behaviors.test-cases';
import { registerEnsureFormsSatisfiedCases } from './forms.handler.attractap-forms-handler.ensure-forms-satisfied.test-cases';
import { registerHandleResourceUsageFormGetFieldsCases } from './forms.handler.attractap-forms-handler.handle-resource-usage-form-get-fields.test-cases';
import { registerHandleResourceUsageFormSubmitPageCases } from './forms.handler.attractap-forms-handler.handle-resource-usage-form-submit-page.test-cases';
describe('AttractapFormsHandler', () => {
  const fixture = registerAttractapFormsHandlerFixture();
  registerFormDraftKeyCases(fixture);
  registerGetFormDraftCases(fixture);
  registerClearFormDraftCases(fixture);
  registerHandleResourceUsageFormCancelCases(fixture);
  registerEnsureFormsSatisfiedCases(fixture);
  registerHandleResourceUsageFormGetFieldsCases(fixture);
  registerHandleResourceUsageFormSubmitPageCases(fixture);
});
