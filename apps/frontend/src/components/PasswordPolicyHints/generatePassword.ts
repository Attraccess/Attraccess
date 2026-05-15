const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SPECIAL = '!@#$%^&*()-_=+[]{}<>?';

export interface GenerateOptions {
  length?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireDigit?: boolean;
  requireSpecial?: boolean;
}

function pickRandom(pool: string): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return pool.charAt(buffer[0] % pool.length);
}

function shuffle(input: string): string {
  const arr = input.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const j = buffer[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

export function generateStrongPassword(opts: GenerateOptions = {}): string {
  const length = Math.max(16, opts.length ?? 20);
  const pools: string[] = [LOWER + UPPER + DIGIT + SPECIAL];
  const required: string[] = [];
  if (opts.requireUppercase) {
    required.push(pickRandom(UPPER));
  }
  if (opts.requireLowercase) {
    required.push(pickRandom(LOWER));
  }
  if (opts.requireDigit) {
    required.push(pickRandom(DIGIT));
  }
  if (opts.requireSpecial) {
    required.push(pickRandom(SPECIAL));
  }
  while (required.length < length) {
    required.push(pickRandom(pools[0]));
  }
  return shuffle(required.join(''));
}
