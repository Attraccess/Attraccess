export default {
  // Success state
  success: {
    title: 'Email Verified!',
    message:
      'Your email has been successfully verified. You can now log in to your account.',
    goToLogin: 'Go to Login',
  },
  // Error state
  error: {
    title: 'Verification Failed',
    tryAgain: 'Try Again',
    backToLogin: 'Back to Login',
    errorTitle: 'Error',
  },
  // API Error messages
  apiErrors: {
    UserEmailInvalidVerificationTokenException:
      'Invalid verification token. Please request a new verification link.',
    invalidLink: 'Invalid verification link. Please request a new one.',
    unexpectedError: 'An unexpected error occurred',
  },
};
