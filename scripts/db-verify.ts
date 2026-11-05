import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

interface TableRow {
  tablename: string
}

export interface VerificationResult {
  success: boolean
  stage: string
  message: string
  details?: Record<string, unknown>
  error?: string
}

/**
 * Sanitizes connection strings and error messages so secrets, passwords, or
 * credentials are never logged or exposed.
 */
function sanitizeErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  const message = error instanceof Error ? error.message : String(error)
  // Mask connection strings matching postgres://... or postgresql://...
  return message.replace(/postgres(ql)?:\/\/[^@\s]+@/gi, 'postgresql://****:****@')
}

export async function runDatabaseVerification(prismaClient?: PrismaClient): Promise<VerificationResult> {
  const prisma = prismaClient ?? new PrismaClient({
    log: ['error'],
  })

  const testExperimentId = `verify-test-${randomUUID()}`
  let testExperimentCreated = false

  try {
    // 1. Connectivity Check
    try {
      await prisma.$queryRaw`SELECT 1 as connected;`
    } catch (err: unknown) {
      return {
        success: false,
        stage: 'CONNECTIVITY',
        message: 'Could not connect to PostgreSQL database.',
        error: sanitizeErrorMessage(err),
      }
    }

    // 2. Table Inspection
    try {
      // Check if experiments and policy_results tables exist
      const tableCheck = await prisma.$queryRaw<TableRow[]>`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename IN ('experiments', 'policy_results');
      `
      const tableNames = tableCheck.map((t: TableRow) => t.tablename)
      const hasExperiments = tableNames.includes('experiments')
      const hasPolicyResults = tableNames.includes('policy_results')

      if (!hasExperiments || !hasPolicyResults) {
        return {
          success: false,
          stage: 'TABLE_VERIFICATION',
          message: 'Expected database tables are missing in public schema.',
          details: {
            foundTables: tableNames,
            missingExperiments: !hasExperiments,
            missingPolicyResults: !hasPolicyResults,
          },
          error: 'Tables not found. Run prisma migrate deploy first.',
        }
      }
    } catch (err: unknown) {
      return {
        success: false,
        stage: 'TABLE_VERIFICATION',
        message: 'Failed to inspect database tables.',
        error: sanitizeErrorMessage(err),
      }
    }

    // 3. Create Uniquely Identifiable Test Experiment with 5 Policies Transactionally
    const policies = [
      'Latency-first',
      'Cost-first',
      'Carbon-first',
      'Default',
      'CloudFlow adaptive',
    ] as const

    try {
      await prisma.experiment.create({
        data: {
          id: testExperimentId,
          name: `Automated CloudFlow DB Verification ${testExperimentId}`,
          workloadType: 'Medium',
          requestCount: 1000,
          durationMinutes: 30,
          slaLatencyThresholdMs: 400,
          arrivalPattern: 'Poisson',
          seed: 4242,
          weights: { alpha: 0.35, beta: 0.25, gamma: 0.25, delta: 0.15 },
          assumptions: {
            prng: 'Mulberry32 PRNG',
            latencyModel: 'Regional base + jitter',
            costModel: 'Tiered execution duration',
            carbonModel: 'Marginal grid intensity',
            coldStartModel: '10-minute container timeout',
          },
          policyResults: {
            create: policies.map((policy, idx) => ({
              policy,
              totalRequests: 1000,
              averageLatencyMs: 120 + idx * 10,
              p95LatencyMs: 200 + idx * 15,
              totalCostUSD: 0.02 + idx * 0.005,
              totalCarbonG: 15 + idx * 2,
              coldStartRatePercent: 4.5,
              slaViolationRatePercent: 1.2,
              averageOverheadMs: 0.5,
            })),
          },
        },
      })
      testExperimentCreated = true
    } catch (err: unknown) {
      return {
        success: false,
        stage: 'EXPERIMENT_CREATION',
        message: 'Failed to create test experiment with 5 policies.',
        error: sanitizeErrorMessage(err),
      }
    }

    // 4. Retrieve and Verify Created Record
    let fetchedExperiment
    try {
      fetchedExperiment = await prisma.experiment.findUnique({
        where: { id: testExperimentId },
        include: { policyResults: true },
      })

      if (!fetchedExperiment) {
        return {
          success: false,
          stage: 'EXPERIMENT_RETRIEVAL',
          message: 'Test experiment could not be retrieved after creation.',
          error: 'Record not found',
        }
      }

      if (fetchedExperiment.policyResults.length !== 5) {
        return {
          success: false,
          stage: 'POLICY_VERIFICATION',
          message: `Expected 5 policy results, but retrieved ${fetchedExperiment.policyResults.length}.`,
          details: { retrievedCount: fetchedExperiment.policyResults.length },
          error: 'Policy count mismatch',
        }
      }
    } catch (err: unknown) {
      return {
        success: false,
        stage: 'EXPERIMENT_RETRIEVAL',
        message: 'Failed to query created test experiment.',
        error: sanitizeErrorMessage(err),
      }
    }

    // 5. Delete Only the Test Experiment (Cascades to policy results)
    try {
      await prisma.experiment.delete({
        where: { id: testExperimentId },
      })
      testExperimentCreated = false
    } catch (err: unknown) {
      return {
        success: false,
        stage: 'EXPERIMENT_CLEANUP',
        message: 'Failed to delete test experiment during cleanup.',
        error: sanitizeErrorMessage(err),
      }
    }

    // 6. Verify Complete Deletion (Zero leftover test records)
    try {
      const remainingExp = await prisma.experiment.findUnique({
        where: { id: testExperimentId },
      })
      const remainingPolicies = await prisma.policyResult.findMany({
        where: { experimentId: testExperimentId },
      })

      if (remainingExp !== null || remainingPolicies.length > 0) {
        return {
          success: false,
          stage: 'CLEANUP_VERIFICATION',
          message: 'Test experiment data was not completely cleaned up.',
          details: {
            experimentDeleted: remainingExp === null,
            remainingPolicyCount: remainingPolicies.length,
          },
          error: 'Cleanup incomplete',
        }
      }
    } catch (err: unknown) {
      return {
        success: false,
        stage: 'CLEANUP_VERIFICATION',
        message: 'Failed to verify deletion of test experiment.',
        error: sanitizeErrorMessage(err),
      }
    }

    return {
      success: true,
      stage: 'COMPLETE',
      message: 'PostgreSQL database verified successfully: connection, tables, transactional write, 5-policy retrieval, and clean deletion confirmed.',
      details: {
        verifiedPoliciesCount: 5,
        testIdCleaned: testExperimentId,
      },
    }
  } catch (unexpectedErr: unknown) {
    return {
      success: false,
      stage: 'UNEXPECTED_ERROR',
      message: 'Unexpected error occurred during database verification.',
      error: sanitizeErrorMessage(unexpectedErr),
    }
  } finally {
    // Guaranteed cleanup attempt for test experiment if creation succeeded but failure happened before step 5
    if (testExperimentCreated) {
      try {
        await prisma.experiment.delete({
          where: { id: testExperimentId },
        }).catch(() => {})
      } catch {
        // Suppress cleanup secondary errors
      }
    }
    if (!prismaClient) {
      await prisma.$disconnect().catch(() => {})
    }
  }
}

// Allow direct execution from CLI: node scripts/db-verify.ts
if (process.argv[1]?.endsWith('db-verify.ts') || process.argv[1]?.endsWith('db-verify.js')) {
  runDatabaseVerification()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
      if (!result.success) {
        process.exit(1)
      }
    })
    .catch((err) => {
      console.error('Unexpected verification crash:', sanitizeErrorMessage(err))
      process.exit(1)
    })
}
