import { hash, genSalt, compare } from 'bcrypt';

export async function securelyHashToken(token: string): Promise<string> {
  const salt = await genSalt(10);
  const hashedToken = await hash(token, salt);
  return hashedToken;
}

export async function verifyToken(token: string, hashedToken: string): Promise<boolean> {
  if (!token || !hashedToken) return false;
  return await compare(token, hashedToken);
}
