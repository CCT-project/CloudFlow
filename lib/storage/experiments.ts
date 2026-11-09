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

export class ForbiddenError extends Error {
  code: string
  constructor(message: string = 'You do not have permission to access or modify this experiment.') {
    super(message)
    this.name = 'ForbiddenError'
    this.code = 'FORBIDDEN'
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
  userId?: string | null
  isPublic?: boolean
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
  correlationId?: string
}

export interface GetExperimentsOptions {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'name'
  order?: 'asc' | 'desc'
  userId?: string
  includePublic?: boolean
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
    findFirst?: (args: any) => Promise<any>
    delete: (args: any) => Promise<any>
  }
  policyResult: {
    createMany: (args: any) => Promise<any>
  }
}

let defaultPrismaColumnsChecked = false
let defaultPrismaColumnsExist = false
const clientOwnershipCache = new WeakMap<object, boolean>()

export async function areOwnershipColumnsAvailable(client: any = defaultPrisma): Promise<boolean> {
  const isDefault = client === defaultPrisma || !client

  if (isDefault) {
    if (defaultPrismaColumnsChecked) return defaultPrismaColumnsExist
    if (!process.env.DATABASE_URL) {
      defaultPrismaColumnsChecked = true
      defaultPrismaColumnsExist = false
      return false
    }
  } else if (typeof client === 'object' && client !== null && clientOwnershipCache.has(client)) {
    return clientOwnershipCache.get(client)!
  }

  try {
    if (client && typeof client === 'object' && '$queryRaw' in client && typeof client.$queryRaw === 'function') {
      const res = await client.$queryRaw`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'experiments' AND (column_name = 'userId' OR column_name = 'userid') LIMIT 1;
      `
      const hasColumn =
        Array.isArray(res) &&
        res.some((r: any) => r && (
          r.column_name === 'userId' ||
          r.column_name === 'userid' ||
          r.COLUMN_NAME === 'userId' ||
          r.COLUMN_NAME === 'userid'
        ))

      if (isDefault) {
        defaultPrismaColumnsChecked = true
        defaultPrismaColumnsExist = hasColumn
      } else if (typeof client === 'object' && client !== null) {
        clientOwnershipCache.set(client, hasColumn)
      }
      return hasColumn
    }
  } catch {
    if (isDefault) {
      defaultPrismaColumnsChecked = true
      defaultPrismaColumnsExist = false
    } else if (typeof client === 'object' && client !== null) {
      clientOwnershipCache.set(client, false)
    }
    return false
  }

  if (isDefault) {
    defaultPrismaColumnsChecked = true
    defaultPrismaColumnsExist = false
  }
  return false
}

export function resetOwnershipColumnsCheck(): void {
  defaultPrismaColumnsChecked = false
  defaultPrismaColumnsExist = false
}

export function sanitizeDatabaseErrorMessage(error: unknown): string {
  if (!error) return 'Unknown database error'
  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : (error as any)?.message || String(error)

  return rawMessage
    // Redact connection strings with credentials: postgres://user:password@host...
    .replace(/postgres(ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED_AUTH]@')
    // Redact any remaining raw URLs with query params
    .replace(/postgres(ql)?:\/\/[^\s"'`]+/gi, 'postgresql://[REDACTED_URL]')
    // Redact explicit credential flags
    .replace(/(password|secret|token|api_?key)=([^\s;&"']+)/gi, '$1=[REDACTED]')
    // Redact emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    // Truncate to reasonable safe length
    .slice(0, 500)
}

export interface ErrorLogContext {
  operation?: string
  correlationId?: string
}

const loggedErrors = new WeakSet<object>()

export function sanitizeCorrelationId(id: unknown): string {
  if (typeof id === 'string') {
    const trimmed = id.trim()
    if (/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
      return trimmed
    }
  }
  return crypto.randomUUID()
}

export function logStructuredDatabaseError(error: unknown, context: ErrorLogContext = {}): void {
  // Prevent duplicate logging of the same exception without mutating error object
  if (error && typeof error === 'object') {
    if (loggedErrors.has(error)) {
      return
    }
    loggedErrors.add(error)
  }

  const err = error as { name?: string; code?: string; meta?: any; message?: string }
  const safeMessage = sanitizeDatabaseErrorMessage(error)

  const isPrismaCode = typeof err?.code === 'string' && /^P\d{4}$/.test(err.code)
  const prismaCode = isPrismaCode ? err.code : undefined

  let sqlState: string | undefined
  if (
    err?.meta?.code &&
    typeof err.meta.code === 'string' &&
    /^[0-9A-Z]{5}$/.test(err.meta.code) &&
    !/^P\d{4}$/.test(err.meta.code)
  ) {
    sqlState = err.meta.code
  } else if (err?.code && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && !isPrismaCode) {
    sqlState = err.code
  }

  const payload = {
    level: 'error',
    correlationId: context.correlationId || 'unknown',
    operation: context.operation || 'database_operation',
    errorName: err?.name || (error instanceof Error ? error.name : 'DatabaseError'),
    prismaCode,
    sqlState,
    sanitizedMessage: safeMessage,
    timestamp: new Date().toISOString(),
  }

  console.error(JSON.stringify(payload))
}

function handlePrismaError(error: unknown, context: ErrorLogContext = {}): never {
  if (error instanceof NotFoundError || error instanceof ForbiddenError || error instanceof DatabaseError) {
    throw error
  }

  logStructuredDatabaseError(error, context)

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
    userId: raw.userId ?? null,
    isPublic: Boolean(raw.isPublic),
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

export function generateExperimentLockKey(input: {
  userId?: string | null
  workloadType: string
  requestCount: number
  durationMinutes: number
  slaLatencyThresholdMs: number
  arrivalPattern: string
  seed: number
  weights?: any
}): string {
  const parts = [
    input.userId || 'anon',
    input.workloadType,
    input.requestCount,
    input.durationMinutes,
    input.slaLatencyThresholdMs,
    input.arrivalPattern,
    input.seed,
    JSON.stringify(input.weights || {}),
  ]
  return parts.join(':')
}

export function matchesExperimentWorkload(
  exp: any,
  input: {
    workloadType: string
    requestCount: number
    durationMinutes: number
    slaLatencyThresholdMs: number
    arrivalPattern: string
    seed: number
    userId?: string | null
    weights?: any
  },
  since: Date,
  hasColumns: boolean
): boolean {
  if (!exp) return false
  if (exp.workloadType !== input.workloadType) return false
  if (Number(exp.requestCount) !== Number(input.requestCount)) return false
  if (Number(exp.durationMinutes) !== Number(input.durationMinutes)) return false
  if (Number(exp.slaLatencyThresholdMs) !== Number(input.slaLatencyThresholdMs)) return false
  if (exp.arrivalPattern !== input.arrivalPattern) return false
  if (Number(exp.seed) !== Number(input.seed)) return false
  if (hasColumns && (exp.userId ?? null) !== (input.userId ?? null)) return false

  if (input.weights && exp.weights) {
    const w1 = input.weights
    const w2 = exp.weights
    if (
      w1.alpha !== undefined &&
      w2.alpha !== undefined &&
      (w1.alpha !== w2.alpha || w1.beta !== w2.beta || w1.gamma !== w2.gamma || w1.delta !== w2.delta)
    ) {
      return false
    }
  }

  const expTime = exp.createdAt instanceof Date ? exp.createdAt.getTime() : new Date(exp.createdAt).getTime()
  if (expTime < since.getTime()) return false
  return true
}

export async function createExperiment(
  input: CreateExperimentStorageInput,
  client: ExperimentPrismaClient = defaultPrisma
): Promise<ExperimentRecord> {
  try {
    const hasColumns = await areOwnershipColumnsAvailable(client)

    const experimentData: Record<string, any> = {
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
    }

    if (hasColumns) {
      experimentData.userId = input.userId ?? null
      experimentData.isPublic = Boolean(input.isPublic)
    }

    const created = await (client as any).$transaction(async (tx: any) => {
      // 1. Acquire transaction-level advisory lock using deterministic lock key
      if (typeof tx.$queryRaw === 'function') {
        const lockKey = generateExperimentLockKey({
          userId: input.userId,
          workloadType: input.workloadType,
          requestCount: input.requestCount,
          durationMinutes: input.durationMinutes,
          slaLatencyThresholdMs: input.slaLatencyThresholdMs,
          arrivalPattern: input.arrivalPattern,
          seed: input.seed,
          weights: input.weights,
        })
        await tx.$queryRaw`
          SELECT 1::int AS lock_acquired
          FROM (
            SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))
          ) AS lock_result
        `
      }

      // 2. Perform duplicate lookup inside the transaction after acquiring the lock
      const windowSec = 5
      const since = new Date(Date.now() - windowSec * 1000)

      const whereClause: Record<string, any> = {
        workloadType: input.workloadType,
        requestCount: input.requestCount,
        durationMinutes: input.durationMinutes,
        slaLatencyThresholdMs: input.slaLatencyThresholdMs,
        arrivalPattern: input.arrivalPattern,
        seed: input.seed,
        createdAt: { gte: since },
      }

      if (hasColumns) {
        whereClause.userId = input.userId ?? null
      }

      const findFn =
        (tx.experiment as any).findFirst
          ? (args: any) => (tx.experiment as any).findFirst(args)
          : async (args: any) => {
              const list = await tx.experiment.findMany({ ...args, take: 1 })
              return list && list.length > 0 ? list[0] : null
            }

      const existing = await findFn({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          policyResults: true,
        },
      })

      if (existing && matchesExperimentWorkload(existing, input, since, hasColumns)) {
        return existing
      }

      // 3. Insert experiment and policy results within the same transaction
      const exp = await tx.experiment.create({
        data: experimentData,
        include: {
          policyResults: true,
        },
      })
      return exp
    })

    const formatted = formatExperimentRecord(created)
    // If running against pre-migration DB, preserve input's ownership attributes in return value
    if (!hasColumns) {
      formatted.userId = input.userId ?? null
      formatted.isPublic = Boolean(input.isPublic)
    }
    return formatted
  } catch (error) {
    return handlePrismaError(error, {
      operation: 'createExperiment',
      correlationId: input.correlationId,
    })
  }
}

export interface FindRecentDuplicateExperimentInput {
  userId?: string | null
  workloadType: string
  requestCount: number
  durationMinutes: number
  slaLatencyThresholdMs: number
  arrivalPattern: string
  seed: number
  windowSeconds?: number
}

/**
 * Searches for an identical experiment recently created by the same user within a short time window.
 * Used for server-side deduplication to prevent accidental double-insertions.
 */
export async function findRecentDuplicateExperiment(
  params: FindRecentDuplicateExperimentInput,
  client: ExperimentPrismaClient = defaultPrisma
): Promise<ExperimentRecord | null> {
  const windowSec = params.windowSeconds || 5
  const since = new Date(Date.now() - windowSec * 1000)

  try {
    const hasColumns = await areOwnershipColumnsAvailable(client)

    const findFn =
      (client.experiment as any).findFirst
        ? (args: any) => (client.experiment as any).findFirst(args)
        : async (args: any) => {
            const list = await client.experiment.findMany({ ...args, take: 1 })
            return list && list.length > 0 ? list[0] : null
          }

    const whereClause: Record<string, any> = {
      workloadType: params.workloadType,
      requestCount: params.requestCount,
      durationMinutes: params.durationMinutes,
      slaLatencyThresholdMs: params.slaLatencyThresholdMs,
      arrivalPattern: params.arrivalPattern,
      seed: params.seed,
      createdAt: { gte: since },
    }

    if (hasColumns) {
      whereClause.userId = params.userId ?? null
    }

    const found = await findFn({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        policyResults: true,
      },
    })

    if (!found) return null
    return formatExperimentRecord(found)
  } catch {
    // Fail open safely on error so experiment persistence is never blocked
    return null
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
    const hasColumns = await areOwnershipColumnsAvailable(client)

    let where: Record<string, any>

    if (options.userId) {
      if (options.includePublic === false) {
        // Strict multi-tenant user isolation: return only records owned by this user
        where = { userId: options.userId }
      } else {
        // Return user's private records plus public shared benchmarks (never unassigned)
        where = {
          OR: [
            { userId: options.userId },
            { isPublic: true },
          ],
        }
      }
    } else {
      // Unauthenticated or general public listing: strictly public benchmarks only
      where = { isPublic: true }
    }

    const [total, items] = await Promise.all([
      client.experiment.count({ where }),
      client.experiment.findMany({
        where,
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
    return handlePrismaError(error, {
      operation: 'getExperiments',
    })
  }
}

export async function getExperimentById(
  id: string,
  userIdOrClient?: string | ExperimentPrismaClient,
  optionalClient?: ExperimentPrismaClient
): Promise<ExperimentRecord> {
  if (!id || typeof id !== 'string') {
    throw new NotFoundError('Invalid experiment ID.')
  }

  const userId = typeof userIdOrClient === 'string' ? userIdOrClient : undefined
  const client =
    typeof userIdOrClient === 'object' && userIdOrClient !== null
      ? (userIdOrClient as ExperimentPrismaClient)
      : (optionalClient || defaultPrisma)

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

    // Ownership & Access Control Validation
    const isOwner = Boolean(userId && exp.userId && exp.userId === userId)
    const isPublic = Boolean(exp.isPublic)

    // Strict fail-closed authorization:
    // 1. If an experiment is public, allow access according to public-access policy.
    // 2. If an experiment is private and userId matches the authenticated user ID, allow access.
    // 3. If an experiment is private and userId belongs to another user, deny access.
    // 4. If an experiment has userId = null and isPublic = false, deny access.
    // 5. If the request is unauthenticated, never expose private or unassigned experiments.
    if (!isOwner && !isPublic) {
      throw new ForbiddenError('You do not have permission to view this private experiment.')
    }

    return formatExperimentRecord(exp)
  } catch (error) {
    return handlePrismaError(error, {
      operation: 'getExperimentById',
    })
  }
}

export async function deleteExperiment(
  id: string,
  userIdOrClient?: string | ExperimentPrismaClient,
  optionalClient?: ExperimentPrismaClient
): Promise<{ id: string; deleted: boolean }> {
  if (!id || typeof id !== 'string') {
    throw new NotFoundError('Invalid experiment ID.')
  }

  const userId = typeof userIdOrClient === 'string' ? userIdOrClient : undefined
  const client =
    typeof userIdOrClient === 'object' && userIdOrClient !== null
      ? (userIdOrClient as ExperimentPrismaClient)
      : (optionalClient || defaultPrisma)

  try {
    const exp = await client.experiment.findUnique({
      where: { id },
    })

    if (!exp) {
      throw new NotFoundError(`Experiment with ID '${id}' was not found.`)
    }

    // Strict fail-closed ownership: only the verified owner can delete an experiment
    if (!userId || !exp.userId || exp.userId !== userId) {
      throw new ForbiddenError('You do not have permission to delete this experiment.')
    }

    await client.experiment.delete({
      where: { id },
    })

    return { id, deleted: true }
  } catch (error) {
    return handlePrismaError(error, {
      operation: 'deleteExperiment',
    })
  }
}
