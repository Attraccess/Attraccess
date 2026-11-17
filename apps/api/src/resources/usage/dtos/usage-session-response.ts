import type {
  ProjectRecord,
  UsageSession,
  UsageSessionFormSubmission,
  UserProfile,
} from '@attraccess/application-models';

/** A form submission of a session as responses carry it. */
export type UsageSessionFormSubmissionResponse = Omit<UsageSessionFormSubmission, 'user'> & {
  user?: UserProfile | null;
};

/**
 * A usage session as responses carry it (the `ResourceUsage` schema): every user in it is reduced to the public
 * profile, so the mail address the session keeps for flows and notifications never leaves the server.
 */
export type UsageSessionResponse = Omit<UsageSession, 'user' | 'supervisorUser' | 'formSubmissions'> & {
  user?: UserProfile | null;
  supervisorUser?: UserProfile | null;
  formSubmissions?: UsageSessionFormSubmissionResponse[];
};

/** The public profile of a user, field by field: mail address, tokens and lock state are never copied. */
export function toPublicUser(user: UserProfile): UserProfile {
  return {
    id: user.id,
    username: user.username,
    locale: user.locale,
    dateTimeLocale: user.dateTimeLocale,
    isEmailVerified: user.isEmailVerified,
    isDisabled: user.isDisabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    externalIdentifier: user.externalIdentifier,
    creditBalance: user.creditBalance,
    billingFactor: user.billingFactor,
  };
}

/** Keeps a relation's absence (not read) and null (no row) apart, so the JSON keeps its shape. */
function publicRelation(user: UserProfile | null | undefined): { user?: UserProfile | null } {
  if (user === undefined) return {};
  return { user: user && toPublicUser(user) };
}

function toProjectResponse(project: ProjectRecord): ProjectRecord {
  const { owner, ...rest } = project;
  return owner === undefined ? rest : { ...rest, owner: toPublicUser(owner) };
}

function toFormSubmissionResponse(submission: UsageSessionFormSubmission): UsageSessionFormSubmissionResponse {
  const { user, ...rest } = submission;
  return { ...rest, ...publicRelation(user) };
}

/** The response of a session. Copies only the keys the session has, so a redacted view stays redacted. */
export function toUsageSessionResponse(session: UsageSession): UsageSessionResponse {
  const { user, supervisorUser, formSubmissions, project, ...rest } = session;
  const supervisor = publicRelation(supervisorUser).user;
  return {
    ...rest,
    ...publicRelation(user),
    ...(supervisorUser === undefined ? {} : { supervisorUser: supervisor }),
    ...(project === undefined ? {} : { project: project && toProjectResponse(project) }),
    ...(formSubmissions === undefined ? {} : { formSubmissions: formSubmissions.map(toFormSubmissionResponse) }),
  };
}
