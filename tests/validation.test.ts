import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateScheduleEvaluateRequest,
  validateSimulateRequest,
  MAX_SIMULATION_REQUEST_COUNT,
} from '../lib/validation/api-validator.ts'

test('Validation: Valid simulate request payload', () => {
  const result = validateSimulateRequest({
    requestCount: 1000,
    slaLatencyThresholdMs: 400,
    arrivalPattern: 'Poisson',
    policy: 'Latency-first',
  })

  assert.equal(result.isValid, true)
})

test('Validation: Simulate rejects negative or zero request counts', () => {
  const zeroResult = validateSimulateRequest({
    requestCount: 0,
    slaLatencyThresholdMs: 400,
  })
  assert.equal(zeroResult.isValid, false)
  if (!zeroResult.isValid) {
    assert.match(zeroResult.details.join(' '), /at least 1/)
  }

  const negResult = validateSimulateRequest({
    requestCount: -50,
    slaLatencyThresholdMs: 400,
  })
  assert.equal(negResult.isValid, false)
})

test('Validation: Simulate enforces max request count boundary', () => {
  const result = validateSimulateRequest({
    requestCount: MAX_SIMULATION_REQUEST_COUNT + 1,
    slaLatencyThresholdMs: 400,
  })
  assert.equal(result.isValid, false)
  if (!result.isValid) {
    assert.match(result.details.join(' '), /exceeds maximum allowable limit/)
  }
})

test('Validation: Simulate rejects non-finite and negative SLA thresholds', () => {
  const negSla = validateSimulateRequest({
    requestCount: 100,
    slaLatencyThresholdMs: -10,
  })
  assert.equal(negSla.isValid, false)

  const nanSla = validateSimulateRequest({
    requestCount: 100,
    slaLatencyThresholdMs: NaN,
  })
  assert.equal(nanSla.isValid, false)
})

test('Validation: Simulate rejects invalid policy string', () => {
  const result = validateSimulateRequest({
    requestCount: 100,
    slaLatencyThresholdMs: 400,
    policy: 'invalid-policy-name' as any,
  })
  assert.equal(result.isValid, false)
  if (!result.isValid) {
    assert.match(result.details.join(' '), /Invalid policy/)
  }
})

test('Validation: Schedule Evaluate requires non-empty candidates list', () => {
  const emptyResult = validateScheduleEvaluateRequest({
    policy: 'Latency-first',
    slaLatencyThresholdMs: 300,
    candidates: [],
  })
  assert.equal(emptyResult.isValid, false)
  if (!emptyResult.isValid) {
    assert.match(emptyResult.details.join(' '), /cannot be empty/)
  }

  const missingResult = validateScheduleEvaluateRequest({
    policy: 'Latency-first',
    slaLatencyThresholdMs: 300,
  })
  assert.equal(missingResult.isValid, false)
})

test('Validation: Rejects non-object bodies', () => {
  assert.equal(validateSimulateRequest(null).isValid, false)
  assert.equal(validateSimulateRequest('plain string').isValid, false)
  assert.equal(validateScheduleEvaluateRequest([]).isValid, false)
})
