import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateAverageLatency,
  calculateCarbonEmissions,
  calculateColdStartRate,
  calculateExecutionCost,
  calculateP95Latency,
  calculateSlaViolationRate,
} from '../lib/metrics/calculations.ts'

test('Metric Calculations: Execution Cost', () => {
  // 100 ms at $0.00000002/ms + $0.0000002 invocation fee
  const cost = calculateExecutionCost(100, 0.00000002, 0.0000002)
  assert.equal(cost, 0.0000022)

  // Zero duration
  const zeroDurationCost = calculateExecutionCost(0, 0.00000002, 0.0000002)
  assert.equal(zeroDurationCost, 0.0000002)

  // Negative input check
  assert.throws(() => calculateExecutionCost(-10, 0.00001), /must be non-negative/)
})

test('Metric Calculations: Carbon Emissions', () => {
  // 3600000 ms (1 hour) at 1000W (1kW) with 100 g CO2/kWh -> 100g
  const carbon = calculateCarbonEmissions(3600000, 100, 1000)
  assert.equal(Math.round(carbon), 100)

  // Zero duration -> zero emissions
  assert.equal(calculateCarbonEmissions(0, 400), 0)

  // Negative parameters check
  assert.throws(() => calculateCarbonEmissions(100, -50), /must be non-negative/)
})

test('Metric Calculations: Average Latency', () => {
  assert.equal(calculateAverageLatency([]), 0)
  assert.equal(calculateAverageLatency([100, 200, 300]), 200)
  assert.equal(calculateAverageLatency([150, 150, 150]), 150)
})

test('Metric Calculations: P95 Latency', () => {
  assert.equal(calculateP95Latency([]), 0)

  // 100 values from 1 to 100
  const values = Array.from({ length: 100 }, (_, i) => i + 1)
  // 95th percentile with nearest rank: index = ceil(0.95 * 100) - 1 = 94 -> value 95
  assert.equal(calculateP95Latency(values), 95)

  // Small array
  const small = [10, 20, 30, 40, 50]
  // index = ceil(0.95 * 5) - 1 = 4 -> value 50
  assert.equal(calculateP95Latency(small), 50)
})

test('Metric Calculations: Cold-Start Rate and SLA Violation Rate', () => {
  assert.equal(calculateColdStartRate(0, 100), 0)
  assert.equal(calculateColdStartRate(8, 100), 8)
  assert.equal(calculateColdStartRate(0, 0), 0)

  assert.equal(calculateSlaViolationRate(0, 1000), 0)
  assert.equal(calculateSlaViolationRate(15, 1000), 1.5)
  assert.equal(calculateSlaViolationRate(0, 0), 0)
})
