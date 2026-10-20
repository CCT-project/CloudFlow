import type { ServerlessCandidate } from '../types/scheduler.ts'

/**
 * Default multi-cloud serverless candidates used in simulations and evaluations.
 * 
 * Note on Data Sources & Modeling:
 * - Pricing models are normalized estimates based on typical 512MB/1-vCPU serverless configurations.
 * - Regional carbon intensities are based on public grid averages (e.g. Electricity Maps, IEA regional benchmarks).
 * - Latencies represent simulated baseline round-trip execution durations.
 */
export const DEFAULT_CANDIDATES: ServerlessCandidate[] = [
  {
    id: 'aws-us-east-1',
    name: 'AWS Lambda (us-east-1 · N. Virginia)',
    provider: 'AWS',
    region: 'us-east-1',
    baseLatencyMs: 140,
    coldStartLatencyMs: 220,
    costPerMsUSD: 0.000000021,
    carbonIntensityGPerKwh: 380, // PJM Interconnection grid average
    activeInstances: 12,
    isWarm: true,
  },
  {
    id: 'aws-eu-west-1',
    name: 'AWS Lambda (eu-west-1 · Ireland)',
    provider: 'AWS',
    region: 'eu-west-1',
    baseLatencyMs: 190,
    coldStartLatencyMs: 210,
    costPerMsUSD: 0.000000019,
    carbonIntensityGPerKwh: 260, // EirGrid Ireland average
    activeInstances: 8,
    isWarm: true,
  },
  {
    id: 'gcp-us-central1',
    name: 'Google Cloud Run (us-central1 · Iowa)',
    provider: 'GCP',
    region: 'us-central1',
    baseLatencyMs: 160,
    coldStartLatencyMs: 340,
    costPerMsUSD: 0.000000015,
    carbonIntensityGPerKwh: 460, // MISO grid average
    activeInstances: 5,
    isWarm: false,
  },
  {
    id: 'azure-norway-east',
    name: 'Azure Functions (norway-east · Oslo)',
    provider: 'Azure',
    region: 'norway-east',
    baseLatencyMs: 230,
    coldStartLatencyMs: 280,
    costPerMsUSD: 0.000000024,
    carbonIntensityGPerKwh: 25, // Nordic hydro-dominant low-carbon grid
    activeInstances: 4,
    isWarm: true,
  },
  {
    id: 'aws-ap-south-1',
    name: 'AWS Lambda (ap-south-1 · Mumbai)',
    provider: 'AWS',
    region: 'ap-south-1',
    baseLatencyMs: 210,
    coldStartLatencyMs: 240,
    costPerMsUSD: 0.000000018,
    carbonIntensityGPerKwh: 650, // National grid thermal-dominant average
    activeInstances: 6,
    isWarm: false,
  },
]

export const DEFAULT_SIMULATION_ASSUMPTIONS = {
  prng: 'Deterministic Mulberry32 algorithm with reproducible seed',
  latencyModel: 'Base regional latency + synthetic duration + cold start delay (if cold) + bounded jitter (+/- 7.5ms)',
  costModel: 'Calculated using durationMs * costPerMsUSD + standard invocation fee ($0.0000002)',
  carbonModel: 'Calculated from 35W container power estimate * duration * regional grid carbon intensity (g CO2e/kWh)',
  coldStartModel: '10-minute idle container expiration timeout based on request arrival timestamp intervals',
  adaptivePolicyModel: 'Two-stage multi-objective optimization: Stage A filters for SLA feasibility; Stage B minimizes normalized score = alpha*Cost + beta*Carbon + gamma*Latency + delta*ColdRisk',
}
