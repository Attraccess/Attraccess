import { defineEmailServiceTests } from './email.service.spec.defineEmailServiceTests.test-fixture';
import { defineShippedUsageReceiptTests } from './email.service.spec.defineShippedUsageReceiptTests.test-fixture';
import { defineTHandlebarsHelperTests } from './email.service.spec.defineTHandlebarsHelperTests.test-fixture';
import { defineSendResourceHealthChangedEmailTests } from './email.service.spec.defineSendResourceHealthChangedEmailTests.test-fixture';
import { defineSendUserRetrainingEmailTests } from './email.service.spec.defineSendUserRetrainingEmailTests.test-fixture';
import { defineSendResourceUsageNoteEmailTests } from './email.service.spec.defineSendResourceUsageNoteEmailTests.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('EmailService', () => {
  defineEmailServiceTests();
});
export type EmailServiceTestScope = ReturnType<typeof defineEmailServiceTests>;
export type ShippedUsageReceiptTestScope = ReturnType<typeof defineShippedUsageReceiptTests>;
export type THandlebarsHelperTestScope = ReturnType<typeof defineTHandlebarsHelperTests>;
export type SendResourceHealthChangedEmailTestScope = ReturnType<typeof defineSendResourceHealthChangedEmailTests>;
export type SendUserRetrainingEmailTestScope = ReturnType<typeof defineSendUserRetrainingEmailTests>;
export type SendResourceUsageNoteEmailTestScope = ReturnType<typeof defineSendResourceUsageNoteEmailTests>;

export { defineEmailServiceTests } from './email.service.spec.defineEmailServiceTests.test-fixture';
export { defineShippedUsageReceiptTests } from './email.service.spec.defineShippedUsageReceiptTests.test-fixture';
export { defineTHandlebarsHelperTests } from './email.service.spec.defineTHandlebarsHelperTests.test-fixture';
export { defineSendResourceHealthChangedEmailTests } from './email.service.spec.defineSendResourceHealthChangedEmailTests.test-fixture';
export { defineSendUserRetrainingEmailTests } from './email.service.spec.defineSendUserRetrainingEmailTests.test-fixture';
export { defineSendResourceUsageNoteEmailTests } from './email.service.spec.defineSendResourceUsageNoteEmailTests.test-fixture';
