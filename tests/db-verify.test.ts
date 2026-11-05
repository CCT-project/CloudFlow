import test from 'node:test'
import assert from 'node:assert/strict'
import { runDatabaseVerification } from '../scripts/db-verify.ts'
import type { PrismaClient } from '@prisma/client'

test('DB Verification: Returns structured error when database is unreachable', async () => {
  // Mock client that fails connectivity
  const mockClient = {
    $queryRaw: async () => {
      throw new Error('Connection refused at postgresql://fake_user:fake_password@db.example.com:5432/cloudflow')
    },
    $disconnect: async () => {},
  } as unknown as PrismaClient

  const result = await runDatabaseVerification(mockClient)
  assert.equal(result.success, false)
  assert.equal(result.stage, 'CONNECTIVITY')
  assert.ok(result.error?.includes('Could not connect') || result.message.includes('Could not connect'))
  // Verify credentials are sanitised and NEVER exposed
  assert.ok(!result.error?.includes('fake_password'), 'Password must never be logged or exposed')
  assert.ok(result.error?.includes('****:****'), 'Connection string should be masked')
})

test('DB Verification: Detects missing schema tables and suggests migration', async () => {
  // Mock client where connectivity succeeds but tables are missing
  const mockClient = {
    $queryRaw: async (query: any) => {
      const qStr = String(query?.strings || query || '')
      if (qStr.includes('SELECT 1')) {
        return [{ connected: 1 }]
      }
      // pg_tables check returning empty array
      return []
    },
    $disconnect: async () => {},
  } as unknown as PrismaClient

  const result = await runDatabaseVerification(mockClient)
  assert.equal(result.success, false)
  assert.equal(result.stage, 'TABLE_VERIFICATION')
  assert.ok(result.error?.includes('prisma migrate deploy'))
})

test('DB Verification: Full lifecycle (connect, write 5 policies, retrieve, delete, clean)', async () => {
  let createdExperiment: any = null
  let deletedId: string | null = null

  const mockClient = {
    $queryRaw: async (query: any) => {
      const qStr = String(query?.strings || query || '')
      if (qStr.includes('SELECT 1')) return [{ connected: 1 }]
      if (qStr.includes('pg_tables')) {
        return [{ tablename: 'experiments' }, { tablename: 'policy_results' }]
      }
      return []
    },
    experiment: {
      create: async ({ data }: any) => {
        createdExperiment = {
          ...data,
          policyResults: data.policyResults.create,
        }
        return createdExperiment
      },
      findUnique: async ({ where }: any) => {
        if (deletedId && where.id === deletedId) return null
        if (createdExperiment && createdExperiment.id === where.id) {
          return createdExperiment
        }
        return null
      },
      delete: async ({ where }: any) => {
        deletedId = where.id
        return createdExperiment
      },
    },
    policyResult: {
      findMany: async ({ where }: any) => {
        if (deletedId && where.experimentId === deletedId) return []
        return createdExperiment?.policyResults || []
      },
    },
    $disconnect: async () => {},
  } as unknown as PrismaClient

  const result = await runDatabaseVerification(mockClient)
  assert.equal(result.success, true)
  assert.equal(result.stage, 'COMPLETE')
  assert.equal(result.details?.verifiedPoliciesCount, 5)
  // Verify testIdCleaned matches UUID format: verify-test-UUID
  const cleanedId = String(result.details?.testIdCleaned || '')
  assert.ok(cleanedId.startsWith('verify-test-'))
  const uuidPart = cleanedId.replace('verify-test-', '')
  assert.match(uuidPart, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'test ID must incorporate a valid v4 UUID')
})
