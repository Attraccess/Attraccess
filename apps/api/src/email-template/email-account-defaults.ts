import { EmailTemplateType } from '@attraccess/database-entities';
export const emailAccountDefaults = {
  [EmailTemplateType.VERIFY_EMAIL]: {
    subject: '{{t "subject" "Verify your email address"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },

  [EmailTemplateType.RESET_PASSWORD]: {
    subject: '{{t "subject" "Reset your password"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },

  [EmailTemplateType.USER_INVITATION]: {
    subject: '{{t "subject" "You have been invited to join Attraccess!"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },

  [EmailTemplateType.USERNAME_CHANGED]: {
    subject: '{{t "subject" "Your username has been changed"}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'user.previousUsername',
      'user.newUsername',
      'host.frontend',
      'host.backend',
      'url',
    ],
  },

  [EmailTemplateType.PASSWORD_CHANGED]: {
    subject: '{{t "subject" "Your password has been changed"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend'],
  },

  [EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION]: {
    subject: '{{t "subject" "Confirm account deletion"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },

  [EmailTemplateType.PROJECT_INVITATION]: {
    subject: '{{t "subject" "You have been invited to {project}" project=project.name}}',
    variables: [
      'user.username',
      'project.name',
      'inviter.username',
      'invitation.id',
      'invitation.role',
      'invitationUrl',
      'host.frontend',
    ],
  },
};
