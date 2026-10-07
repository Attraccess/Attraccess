import { defineAttractapCardHandlerTests } from './card.handler.spec.define-attractap-card-handler-tests';
describe('AttractapCardHandler', () => {
  defineAttractapCardHandlerTests();
});
export {
  defineAttractapCardHandlerTests,
  AttractapCardHandlerTestScope,
  defineHandleCardAuthenticationRequestTests,
  defineOnEnrollNewCardTests,
  defineStartResetOfNfcCardTests,
  defineOnEnrollNewCardRequestNfckeyTests,
  defineOnResetNfcCardTests,
  defineStartEnrollOfNewNfcCardTests,
} from './card.handler.spec.define-attractap-card-handler-tests';
export { HandleCardAuthenticationRequestTestScope } from './card.handler.spec.handle-card-authentication-request-test-scope';
export { OnEnrollNewCardTestScope } from './card.handler.spec.on-enroll-new-card-test-scope';
export { StartResetOfNfcCardTestScope } from './card.handler.spec.start-reset-of-nfc-card-test-scope';
export { OnEnrollNewCardRequestNfckeyTestScope } from './card.handler.spec.on-enroll-new-card-request-nfckey-test-scope';
export { OnResetNfcCardTestScope } from './card.handler.spec.on-reset-nfc-card-test-scope';
export { StartEnrollOfNewNfcCardTestScope } from './card.handler.spec.start-enroll-of-new-nfc-card-test-scope';
