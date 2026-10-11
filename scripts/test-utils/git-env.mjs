import { execFileSync } from 'node:child_process';

const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n');

// Fixture subprocesses must discover their own repository, even inside a Git hook.
export function fixtureGitEnv(inherited = process.env) {
  const env = { ...inherited };
  for (const name of localVariables) delete env[name];
  return env;
}
