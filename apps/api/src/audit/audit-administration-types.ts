export interface AdministrationAuditEvent {
  action: string;
  operationId?: string;
  actorId: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
  subjectType: string;
  subjectId: number;
  outcome?: 'succeeded' | 'failed';
  details: Record<string, string | number>;
}
export type Check = (value: unknown) => boolean;

export type PreviousAuditSettings = { enabled: boolean; domains: readonly string[] };
