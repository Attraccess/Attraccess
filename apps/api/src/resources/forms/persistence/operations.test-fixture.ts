import { FormsPersistence, FORM_OPERATIONS } from './port';
import { operationTransactionsFake } from '../../../database/testing/operation-transactions.test-fixture';

export function formsOperationsFake() {
  const persistence: jest.Mocked<FormsPersistence> = {
    resource: jest.fn(),
    list: jest.fn(),
    required: jest.fn(),
    form: jest.fn(),
    createForm: jest.fn(),
    updateForm: jest.fn(),
    fields: jest.fn(),
    insertFields: jest.fn(),
    insertField: jest.fn(),
    updateField: jest.fn(),
    deleteFields: jest.fn(),
    saveSubmission: jest.fn(),
    deleteFormData: jest.fn(),
  };
  const driver = operationTransactionsFake();
  driver.bind(FORM_OPERATIONS, persistence);
  return { persistence, driver, transactions: driver.transactions };
}
