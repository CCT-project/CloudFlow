import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from '../lib/auth/password.ts'
import { createSessionToken, verifySessionToken } from '../lib/auth/session.ts'
import { createUser, findUserByEmail, findUserById } from '../lib/storage/users.ts'
import { validateRegisterRequest, validateLoginRequest } from '../lib/validation/api-validator.ts'

test('Auth Validation: Validates registration payload rules', () => {
  const invalidEmail = validateRegisterRequest({
    name: 'Alice',
    email: 'not-an-email',
    password: 'Password123!',
  })
  assert.equal(invalidEmail.isValid, false)
  if (!invalidEmail.isValid) {
    assert.match(invalidEmail.details.join(' '), /valid email/)
  }

  const weakPass = validateRegisterRequest({
    name: 'Alice',
    email: 'alice@example.com',
    password: 'short',
  })
  assert.equal(weakPass.isValid, false)
  if (!weakPass.isValid) {
    assert.match(weakPass.details.join(' '), /at least 8 characters/)
  }

  const shortName = validateRegisterRequest({
    name: 'A',
    email: 'alice@example.com',
    password: 'ValidPassword123!',
  })
  assert.equal(shortName.isValid, false)

  const valid = validateRegisterRequest({
    name: 'Dr. Alice Smith',
    email: 'ALICE@EXAMPLE.COM ',
    password: 'ValidPassword123!',
  })
  assert.equal(valid.isValid, true)
  if (valid.isValid) {
    assert.equal(valid.data.email, 'alice@example.com', 'Email must be normalized to lowercase')
    assert.equal(valid.data.name, 'Dr. Alice Smith')
  }
})

test('Auth Validation: Validates login payload rules', () => {
  const emptyPass = validateLoginRequest({
    email: 'alice@example.com',
    password: '',
  })
  assert.equal(emptyPass.isValid, false)

  const valid = validateLoginRequest({
    email: 'alice@example.com',
    password: 'SomePassword123!',
  })
  assert.equal(valid.isValid, true)
})

test('Auth Password: Hashes and verifies password with bcrypt', async () => {
  const password = 'SuperSecurePassword2026!'
  const hash = await hashPassword(password)

  assert.notEqual(password, hash, 'Password hash must not equal plaintext')
  assert.ok(hash.startsWith('$2'), 'Hash should follow bcrypt format')

  const valid = await verifyPassword(password, hash)
  assert.equal(valid, true, 'Correct password must verify successfully')

  const invalid = await verifyPassword('WrongPassword123!', hash)
  assert.equal(invalid, false, 'Incorrect password must be rejected')
})

test('Auth Session: Signs and verifies session tokens safely', () => {
  const user = {
    id: 'user-12345',
    email: 'researcher@cloudflow.org',
    name: 'Dr. CloudFlow',
  }

  const token = createSessionToken(user)
  assert.ok(token.includes('.'), 'Token must contain payload and signature')

  const verified = verifySessionToken(token)
  assert.ok(verified !== null, 'Valid token must decode and verify')
  assert.equal(verified?.user.email, user.email)
  assert.equal(verified?.user.name, user.name)

  // Tampered payload test
  const parts = token.split('.')
  const tamperedToken = `${parts[0]}tampered.${parts[1]}`
  const tamperedResult = verifySessionToken(tamperedToken)
  assert.equal(tamperedResult, null, 'Tampered token must be rejected')

  // Empty or invalid token
  assert.equal(verifySessionToken(''), null)
  assert.equal(verifySessionToken('invalid.token.structure'), null)
})

test('Auth Storage: Creates and retrieves user records', async () => {
  const testEmail = `test-${Date.now()}@example.com`
  const passwordHash = await hashPassword('TestPassword123!')

  const created = await createUser({
    name: 'Test Researcher',
    email: testEmail,
    passwordHash,
  })

  assert.ok(created.id)
  assert.equal(created.email, testEmail)
  assert.equal(created.name, 'Test Researcher')

  const fetchedByEmail = await findUserByEmail(testEmail)
  assert.ok(fetchedByEmail !== null)
  assert.equal(fetchedByEmail?.id, created.id)

  const fetchedById = await findUserById(created.id)
  assert.ok(fetchedById !== null)
  assert.equal(fetchedById?.email, testEmail)

  const nonExistent = await findUserByEmail('does-not-exist@example.com')
  assert.equal(nonExistent, null)
})
