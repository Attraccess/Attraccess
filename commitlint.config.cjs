module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [0],
    'scope-enum': [0],
    'subject-case': [0],
    'header-max-length': [2, 'always', 120],
  },
};
