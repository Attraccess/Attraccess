export enum EmailTemplateType {
  VERIFY_EMAIL = 'verify-email',
  USER_INVITATION = 'user-invitation',
  RESET_PASSWORD = 'reset-password',
  USERNAME_CHANGED = 'username-changed',
  PASSWORD_CHANGED = 'password-changed',
  RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY = 'resource-usage-billing-transaction-summary',
  PROJECT_INVITATION = 'project-invitation',
  DELETE_ACCOUNT_CONFIRMATION = 'delete-account-confirmation',
  RESOURCE_HEALTH_CHANGED = 'resource-health-changed',
  USER_RETRAINING_REQUIRED = 'user-retraining-required',
  MAINTENANCE_REQUEST_CREATED = 'maintenance-request-created',
  MESSAGE_RECEIVED = 'message-received',
  RESOURCE_USAGE_NOTE_ADDED = 'resource-usage-note-added',
  RESOURCE_TAKEOVER = 'resource-takeover',
  ACCESS_CHANGE = 'access-change',
  RESOURCE_SESSION_ENDED = 'resource-session-ended',
}

export interface EmailTemplate {
  type: EmailTemplateType;
  subject: string;
  body: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}
