import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

/**
 * Hashes a plaintext password securely using bcrypt with 10 salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.')
  }
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Verifies a plaintext password against an existing bcrypt hash.
 * Timing-safe comparison is handled internally by bcrypt.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false
  }
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}
