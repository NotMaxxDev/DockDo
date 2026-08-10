import * as argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string, minLength: number): string[] {
  const errors: string[] = [];
  if (!password || password.length < minLength) {
    errors.push(`Das Passwort muss mindestens ${minLength} Zeichen lang sein.`);
  }
  if (password && !/[a-z]/.test(password)) errors.push('Das Passwort muss einen Kleinbuchstaben enthalten.');
  if (password && !/[A-Z]/.test(password)) errors.push('Das Passwort muss einen Großbuchstaben enthalten.');
  if (password && !/[0-9]/.test(password)) errors.push('Das Passwort muss eine Ziffer enthalten.');
  return errors;
}

export function generateTemporaryPassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const out: string[] = [];
  const bytes = require('crypto').randomBytes(length);
  for (let i = 0; i < length; i++) out.push(chars[bytes[i] % chars.length]);
  return out.join('');
}