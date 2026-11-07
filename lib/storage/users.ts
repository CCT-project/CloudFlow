import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { prisma as defaultPrisma } from '../prisma.ts'

export interface UserRecord {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
  updatedAt: string
}

export class DatabaseUnavailableError extends Error {
  code: string
  constructor(message: string = 'PostgreSQL database is currently unavailable or not configured.') {
    super(message)
    this.name = 'DatabaseUnavailableError'
    this.code = 'DATABASE_UNAVAILABLE'
  }
}

const isProduction = process.env.NODE_ENV === 'production'
const DATA_DIR = path.resolve(process.cwd(), 'data')
const DEV_USERS_FILE = path.join(DATA_DIR, 'users.dev.json')

// Isolated fallback for local development only when database migrations have not been applied
function ensureDevFileStore(): void {
  if (isProduction) {
    throw new DatabaseUnavailableError(
      'Local file-based user fallback is forbidden in production environments. PostgreSQL users table must be deployed.'
    )
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!fs.existsSync(DEV_USERS_FILE)) {
    fs.writeFileSync(DEV_USERS_FILE, JSON.stringify([]), 'utf8')
  }
}

function readDevUsers(): UserRecord[] {
  if (isProduction) return []
  try {
    ensureDevFileStore()
    const content = fs.readFileSync(DEV_USERS_FILE, 'utf8')
    return JSON.parse(content) as UserRecord[]
  } catch {
    return []
  }
}

function writeDevUsers(users: UserRecord[]): void {
  if (isProduction) {
    throw new DatabaseUnavailableError(
      'Attempted to write to local user fallback in production. PostgreSQL is mandatory.'
    )
  }
  ensureDevFileStore()
  fs.writeFileSync(DEV_USERS_FILE, JSON.stringify(users, null, 2), 'utf8')
}

let userTableChecked = false
let userTableExists = false

export async function isUserTableAvailable(): Promise<boolean> {
  if (userTableChecked) return userTableExists
  try {
    const res = await defaultPrisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users' LIMIT 1;
    `
    userTableExists = Array.isArray(res) && res.length > 0
    userTableChecked = true
    return userTableExists
  } catch {
    userTableExists = false
    userTableChecked = true
    return false
  }
}

export function resetUserTableCheck(): void {
  userTableChecked = false
  userTableExists = false
}

/**
 * Reset local development user store (useful for clean test runs)
 */
export function resetDevUserStoreForTesting(): void {
  if (!isProduction && fs.existsSync(DEV_USERS_FILE)) {
    try {
      fs.unlinkSync(DEV_USERS_FILE)
    } catch {
      // Ignored in test cleanup
    }
  }
}

/**
 * Finds a user by email address (case-insensitive).
 */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = email.trim().toLowerCase()

  if (isProduction || (await isUserTableAvailable())) {
    try {
      const user = await defaultPrisma.user.findUnique({
        where: { email: normalizedEmail },
      })
      if (user) {
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        }
      }
      return null
    } catch (err: unknown) {
      if (isProduction) {
        throw new DatabaseUnavailableError('PostgreSQL users table query failed in production.')
      }
      // Non-production fallback if table not yet migrated
    }
  }

  // Isolated development fallback
  const users = readDevUsers()
  const found = users.find((u) => u.email.toLowerCase() === normalizedEmail)
  return found || null
}

/**
 * Finds a user by ID.
 */
export async function findUserById(id: string): Promise<UserRecord | null> {
  if (isProduction || (await isUserTableAvailable())) {
    try {
      const user = await defaultPrisma.user.findUnique({
        where: { id },
      })
      if (user) {
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        }
      }
      return null
    } catch (err: unknown) {
      if (isProduction) {
        throw new DatabaseUnavailableError('PostgreSQL users table query failed in production.')
      }
    }
  }

  // Isolated development fallback
  const users = readDevUsers()
  const found = users.find((u) => u.id === id)
  return found || null
}

/**
 * Creates and persists a new user with a hashed password.
 */
export async function createUser(input: {
  name: string
  email: string
  passwordHash: string
}): Promise<UserRecord> {
  const normalizedEmail = input.email.trim().toLowerCase()
  const now = new Date().toISOString()
  const newUser: UserRecord = {
    id: randomUUID(),
    email: normalizedEmail,
    name: input.name.trim(),
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  }

  if (isProduction || (await isUserTableAvailable())) {
    try {
      const created = await defaultPrisma.user.create({
        data: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          passwordHash: newUser.passwordHash,
        },
      })
      return {
        id: created.id,
        email: created.email,
        name: created.name,
        passwordHash: created.passwordHash,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      }
    } catch (err: unknown) {
      if (isProduction) {
        throw new DatabaseUnavailableError('PostgreSQL user creation failed in production.')
      }
    }
  }

  // Isolated development fallback
  const users = readDevUsers()
  if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    throw new Error('A user with this email address already exists.')
  }
  users.push(newUser)
  writeDevUsers(users)
  return newUser
}

/**
 * Returns total count of registered users.
 */
export async function listUsersCount(): Promise<number> {
  if (isProduction || (await isUserTableAvailable())) {
    try {
      return await defaultPrisma.user.count()
    } catch (err: unknown) {
      if (isProduction) {
        throw new DatabaseUnavailableError('PostgreSQL count query failed in production.')
      }
    }
  }
  const users = readDevUsers()
  return users.length
}
