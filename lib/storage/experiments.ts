import { PrismaClient } from '@prisma/client'
import { prisma as defaultPrisma } from '../prisma.ts'
import type {
  ExperimentRecord,
  PersistedPolicyResult,
  WorkloadType,
  ArrivalPattern,
  AdaptiveObjectiveWeights,
  PolicyType,
} from '../types/scheduler.ts'

export class DatabaseError extends Error {
  code: string
  constructor(message: string, code: string = 'DATABASE_ERROR') {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
  }
}

export class DatabaseUnavailableError extends DatabaseError {
  constructor(message: string = 'PostgreSQL database is currently unavailable or not configured.') {
    super(message, 'DATABASE_UNAVAILABLE')
    this.name = 'DatabaseUnavailableError'
  }
}

export class NotFoundError extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
    this.code = 'EXPERIMENT_NOT_FOUND'
  }
}

export interface CreateExperimentStorageInput {
  name: string
  workloadType: WorkloadType
  requestCount: number
  durationMinutes: number
  slaLatencyThresholdMs: number
  arrivalPattern: ArrivalPattern
  seed: number
  weights: AdaptiveObjectiveWeights
  assumptions: {
    prng: string
    latencyModel: string
    costModel: string
    carbonModel: string
    coldStartModel: string
    adaptivePolicyModel?: string
  }
  policyResults: Array<{
    policy: PolicyType
    totalRequests: number
    averageLatencyMs: number
    p95LatencyMs: number
    totalCostUSD: number
    totalCarbonG: number
    coldStartRatePercent: number
    slaViolationRatePercent: number
    averageOverheadMs: number
  }>
}

export interface GetExperimentsOptions {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'name'
  order?: 'asc' | 'desc'
}

export interface GetExperimentsResult {
  experiments: ExperimentRecord[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type ExperimentPrismaClient = PrismaClient | {
  $transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>
  $queryRaw: (query: any) => Promise<any>
  experiment: {
    create: (args: any) => Promise<any>
    count: (args?: any) => Promise<number>
    findMany: (args: any) => Promise<any[]>
    findUnique: (args: any) => Promise<any>
    delete: (args: any) => Promise<any>
  }
  policyResult: {
    createMany: (args: any) => Promise<any>
  }
}

function handlePrismaError(error: unknown): never {
  if (error instanceof NotFoundError || error instanceof DatabaseError) {
    throw error
  }
  const err = error as { code?: string; message?: string }
  if (err?.code === 'P2025') {
    throw new NotFoundError('The requested experiment was not found.')
  }
  if (
    err?.code === 'P1001' ||
    err?.code === 'P1000' ||
    err?.code === 'P1002' ||
    err?.code === 'P1003' ||
    err?.code === 'P1017' ||
    !process.env.DATABASE_URL
  ) {
    throw new DatabaseUnavailableError(
      'Unable to connect to the PostgreSQL database. Please ensure DATABASE_URL is configured and PostgreSQL is running.'
    )
  }
  throw new DatabaseError(
    'A database persistence error occurred while processing the request.',
    'DATABASE_OPERATION_FAILED'
  )
}

function formatExperimentRecord(raw: any): ExperimentRecord {
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
    workloadType: raw.workloadType as WorkloadType,
    requestCount: raw.requestCount,
    durationMinutes: raw.durationMinutes,
    slaLatencyThresholdMs: raw.slaLatencyThresholdMs,
    arrivalPattern: raw.arrivalPattern as ArrivalPattern,
    seed: raw.seed,
    weights: raw.weights as AdaptiveObjectiveWeights,
    assumptions: raw.assumptions as ExperimentRecord['assumptions'],
    policyResults: (raw.policyResults || []).map((p: any) => ({
      id: p.id,
      experimentId: p.experimentId,
      policy: p.policy as PolicyType,
      totalRequests: p.totalRequests,
      averageLatencyMs: p.averageLatencyMs,
      p95LatencyMs: p.p95LatencyMs,
      totalCostUSD: p.totalCostUSD,
      totalCarbonG: p.totalCarbonG,
      coldStartRatePercent: p.coldStartRatePercent,
      slaViolationRatePercent: p.slaViolationRatePercent,
      averageOverheadMs: p.averageOverheadMs,
    })),
  }
}

export async function checkDatabaseConnectivity(client: ExperimentPrismaClient = defaultPrisma): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false
  }
  try {
    if ('$queryRaw' in client) {
      await (client as any).$queryRaw`SELECT 1`
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function createExperiment(
  input: CreateExperimentStorageInput,
  client: ExperimentPrismaClient = defaultPrisma
): Promise<ExperimentRecord> {
  try {
    const created = await (client as any).$transaction(async (tx: any) => {
      const exp = await tx.experiment.create({
        data: {
          name: input.name,
          workloadType: input.workloadType,
          requestCount: input.requestCount,
          durationMinutes: input.durationMinutes,
          slaLatencyThresholdMs: input.slaLatencyThresholdMs,
          arrivalPattern: input.arrivalPattern,
          seed: input.seed,
          weights: input.weights as any,
          assumptions: input.assumptions as any,
          policyResults: {
            create: input.policyResults.map((pr) => ({
              policy: pr.policy,
              totalRequests: pr.totalRequests,
              averageLatencyMs: pr.averageLatencyMs,
              p95LatencyMs: pr.p95LatencyMs,
              totalCostUSD: pr.totalCostUSD,
              totalCarbonG: pr.totalCarbonG,
              coldStartRatePercent: pr.coldStartRatePercent,
              slaViolationRatePercent: pr.slaViolationRatePercent,
              averageOverheadMs: pr.averageOverheadMs,
            })),
          },
        },
        include: {
          policyResults: true,
        },
      })
      return exp
    })

    return formatExperimentRecord(created)
  } catch (error) {
    return handlePrismaError(error)
  }
}

export async function getExperiments(
  options: GetExperimentsOptions = {},
  client: ExperimentPrismaClient = defaultPrisma
): Promise<GetExperimentsResult> {
  const page = Math.max(1, Number(options.page) || 1)
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 10))
  const sortBy = options.sortBy === 'name' ? 'name' : 'createdAt'
  const order = options.order === 'asc' ? 'asc' : 'desc'
  const skip = (page - 1) * limit

  try {
    const [total, items] = await Promise.all([
      client.experiment.count(),
      client.experiment.findMany({
        skip,
        take: limit,
        orderBy: { [sortBy]: order },
        include: {
          policyResults: true,
        },
      }),
    ])

    const totalPages = Math.ceil(total / limit) || 1

    return {
      experiments: items.map(formatExperimentRecord),
      total,
      page,
      limit,
      totalPages,
    }
  } catch (error) {
    return handlePrismaError(error)
  }
}

export async function getExperimentById(
  id: string,
  client: ExperimentPrismaClient = defaultPrisma
): Promise<ExperimentRecord> {
  if (!id || typeof id !== 'string') {
    throw new NotFoundError('Invalid experiment ID.')
  }

  try {
    const exp = await client.experiment.findUnique({
      where: { id },
      include: {
        policyResults: true,
      },
    })

    if (!exp) {
      throw new NotFoundError(`Experiment with ID '${id}' was not found.`)
    }

    return formatExperimentRecord(exp)
  } catch (error) {
    return handlePrismaError(error)
  }
}

export async function deleteExperiment(
  id: string,
  client: ExperimentPrismaClient = defaultPrisma
): Promise<{ id: string; deleted: boolean }> {
  if (!id || typeof id !== 'string') {
    throw new NotFoundError('Invalid experiment ID.')
  }

  try {
    await client.experiment.delete({
      where: { id },
    })

    return { id, deleted: true }
  } catch (error) {
    return handlePrismaError(error)
  }
}
