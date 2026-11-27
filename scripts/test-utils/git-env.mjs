import { execFileSync } from 'node:child_process';

const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n');

// Fixture commits and tags must not need the developer's signing key or a running SSH/GPG agent.
const fixtureConfig = [
  ['commit.gpgsign', 'false'],
  ['tag.gpgsign', 'false'],
];

// Fixture subprocesses must discover their own repository, even inside a Git hook.
export function fixtureGitEnv(inherited = process.env) {
  const env = { ...inherited };
  for (const name of localVariables) delete env[name];
  fixtureConfig.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  env.GIT_CONFIG_COUNT = String(fixtureConfig.length);
  return env;
}
