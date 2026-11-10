# CloudFlow API Reference

This document provides complete, verified documentation for all HTTP API endpoints implemented in CloudFlow.

All request bodies and response payloads use JSON. All endpoints return standardized status codes and error formats.

---

## 1. Authentication Endpoints

### 1.1 `POST /api/auth/register`
Creates a new user account with hashed password credentials.

- **Rate Limit:** 5 requests per 60 seconds per IP.
- **Request Body:**
  ```json
  {
    "email": "researcher@example.edu",
    "password": "StrongPassword123!",
    "name": "Dr. Jane Doe"
  }
  ```
- **Validation Rules:**
  - `email`: Valid email syntax, normalized to lowercase.
  - `password`: Minimum 8 characters, maximum 128 characters.
  - `name`: Minimum 2 characters, maximum 64 characters.
- **Success Response (HTTP 201):**
  ```json
  {
    "status": "success",
    "data": {
      "user": {
        "id": "c7b3d8e0-1234-4567-89ab-cdef01234567",
        "email": "researcher@example.edu",
        "name": "Dr. Jane Doe",
        "createdAt": "2026-11-10T08:00:00.000Z"
      }
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Payload validation failure.
  - `409 Conflict`: An account with this email address already exists.
  - `429 Too Many Requests`: Rate limit exceeded.

---

### 1.2 `POST /api/auth/login`
Authenticates user credentials and issues an HMAC-signed session cookie (`cloudflow_session`).

- **Rate Limit:** 5 requests per 60 seconds per IP.
- **Request Body:**
  ```json
  {
    "email": "researcher@example.edu",
    "password": "StrongPassword123!"
  }
  ```
- **Success Response (HTTP 200):**
  ```json
  {
    "status": "success",
    "data": {
      "user": {
        "id": "c7b3d8e0-1234-4567-89ab-cdef01234567",
        "email": "researcher@example.edu",
        "name": "Dr. Jane Doe"
      }
    }
  }
  ```
  *Sets cookie:* `cloudflow_session=<base64Payload>.<hmacSignature>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
- **Error Responses:**
  - `400 Bad Request`: Invalid request payload.
  - `401 Unauthorized`: Invalid email or password.
  - `429 Too Many Requests`: Rate limit exceeded.

---

### 1.3 `POST /api/auth/logout`
Invalidates the current session by clearing the session cookie.

- **Request Body:** None.
- **Success Response (HTTP 200):**
  ```json
  {
    "status": "success",
    "message": "Logged out successfully"
  }
  ```

---

### 1.4 `GET /api/auth/session`
Returns the profile of the currently authenticated user based on session cookie verification.

- **Headers:** `Cookie: cloudflow_session=...`
- **Success Response (Authenticated, HTTP 200):**
  ```json
  {
    "status": "success",
    "data": {
      "user": {
        "id": "c7b3d8e0-1234-4567-89ab-cdef01234567",
        "email": "researcher@example.edu",
        "name": "Dr. Jane Doe"
      }
    }
  }
  ```
- **Success Response (Unauthenticated, HTTP 200):**
  ```json
  {
    "status": "success",
    "data": {
      "user": null
    }
  }
  ```

---

## 2. Simulation & Scheduling Endpoints

### 2.1 `POST /api/simulate`
Executes a deterministic serverless trace simulation and compares all five scheduling policies.

- **Rate Limit:** 20 requests per 60 seconds per IP.
- **Request Body:**
  ```json
  {
    "workloadType": "Medium",
    "requestCount": 1000,
    "durationMinutes": 10,
    "slaLatencyThresholdMs": 350,
    "arrivalPattern": "Poisson",
    "policy": "CloudFlow adaptive",
    "seed": 42,
    "weights": {
      "cost": 0.35,
      "carbon": 0.25,
      "latency": 0.25,
      "coldStart": 0.15
    },
    "saveExperiment": false,
    "experimentName": "Poisson-1K-Evaluation"
  }
  ```
- **Validation Constraints:**
  - `requestCount`: Integer, $1 \le N \le 50,000$.
  - `slaLatencyThresholdMs`: Strictly positive finite number ($> 0\text{ ms}$).
  - `arrivalPattern`: `'Steady' | 'Poisson' | 'Bursty'`.
  - `weights`: Must sum to $1.0 \pm 0.001$, all values $\ge 0$.
- **Success Response (HTTP 200):**
  ```json
  {
    "status": "success",
    "simulationId": "sim-seed42-k7x9a",
    "timestamp": "2026-11-10T08:15:00.000Z",
    "policy": "CloudFlow adaptive",
    "summary": {
      "policy": "CloudFlow adaptive",
      "totalRequests": 1000,
      "averageLatencyMs": 92.4,
      "p95LatencyMs": 148.2,
      "totalCostUSD": 0.00284,
      "totalCarbonG": 0.342,
      "coldStartRatePercent": 1.2,
      "slaViolationRatePercent": 0.4,
      "averageOverheadMs": 0.012
    },
    "comparison": [
      {
        "policy": "CloudFlow adaptive",
        "averageLatencyMs": 92.4,
        "p95LatencyMs": 148.2,
        "totalCostUSD": 0.00284,
        "totalCarbonG": 0.342,
        "coldStartRatePercent": 1.2,
        "slaViolationRatePercent": 0.4
      },
      { "policy": "Latency-first", ... },
      { "policy": "Cost-first", ... },
      { "policy": "Carbon-first", ... },
      { "policy": "Default", ... }
    ],
    "sampleTraces": [ ... ],
    "savedExperiment": null
  }
  ```

---

### 2.2 `POST /api/schedule/evaluate`
Evaluates a single scheduling decision across supplied multi-cloud candidates under strict Stage A SLA feasibility.

- **Request Body:**
  ```json
  {
    "policy": "CloudFlow adaptive",
    "slaLatencyThresholdMs": 300,
    "weights": {
      "cost": 0.35,
      "carbon": 0.25,
      "latency": 0.25,
      "coldStart": 0.15
    },
    "candidates": [
      {
        "id": "aws-us-east-1",
        "name": "AWS Lambda us-east-1",
        "provider": "AWS",
        "region": "us-east-1",
        "baseLatencyMs": 120,
        "coldStartLatencyMs": 220,
        "costPerMsUSD": 0.000000021,
        "carbonIntensityGPerKwh": 380,
        "activeInstances": 3,
        "isWarm": true
      }
    ]
  }
  ```
- **Success Response (HTTP 200):**
  ```json
  {
    "status": "success",
    "policy": "CloudFlow adaptive",
    "slaLatencyThresholdMs": 300,
    "isSlaSatisfied": true,
    "selectedCandidate": { "id": "aws-us-east-1", ... },
    "decisionExplanation": "Selected 'AWS Lambda us-east-1' with highest normalized utility score (0.842) among SLA-feasible candidates.",
    "evaluations": [ ... ],
    "schedulingOverheadMs": 0.08
  }
  ```

---

### 2.3 `POST /api/research/batch`
Executes multi-seed research validation ($k \ge 30$) with inferential statistical significance testing.

- **Rate Limit:** 10 requests per 60 seconds per IP.
- **Request Body:**
  ```json
  {
    "workloadType": "Medium",
    "requestCount": 1000,
    "durationMinutes": 10,
    "slaLatencyThresholdMs": 350,
    "arrivalPattern": "Poisson",
    "seedCount": 30,
    "seedStart": 42,
    "weights": {
      "cost": 0.35,
      "carbon": 0.25,
      "latency": 0.25,
      "coldStart": 0.15
    }
  }
  ```
- **Validation Constraints:**
  - `seedCount`: Minimum 30 seeds required for statistical validity.
  - Compound Limit: `seedCount * requestCount <= 50,000`.
- **Success Response (HTTP 200):**
  ```json
  {
    "status": "success",
    "data": {
      "configuration": {
        "workloadType": "Medium",
        "requestCount": 1000,
        "seedCount": 30,
        "arrivalPattern": "Poisson",
        "slaLatencyThresholdMs": 350
      },
      "policySummaries": [ ... ],
      "statisticalSignificance": {
        "tests": [
          {
            "baselinePolicy": "Latency-first",
            "metric": "cost",
            "tStatistic": -8.42,
            "degreesOfFreedom": 29,
            "rawPValue": 0.00000001,
            "adjustedPValue": 0.00000004,
            "cohensD": 1.54,
            "effectClassification": "large",
            "isSignificant": true
          }
        ],
        "multipleComparisonMethod": "Holm-Bonferroni",
        "significanceThreshold": 0.05
      },
      "empiricalQuantiles": [ ... ],
      "csvData": "policy,metric,mean,std_dev,ci95_lower,ci95_upper\n..."
    }
  }
  ```

---

## 3. Experiment Persistence Endpoints

### 3.1 `GET /api/experiments`
Retrieves paginated experiment records enforcing fail-closed multi-user data isolation.

- **Query Parameters:**
  - `page`: Page index (default: `1`).
  - `limit`: Records per page ($1 \le \text{limit} \le 100$, default: `10`).
  - `sortBy`: `'createdAt' | 'name'` (default: `'createdAt'`).
  - `order`: `'asc' | 'desc'` (default: `'desc'`).
  - `includePublic`: `'true' | 'false'` (default: `'true'`).
- **Authorization Rules:**
  - **Authenticated User:** Returns user's private experiments plus public shared experiments (unassigned records strictly excluded).
  - **Unauthenticated User:** Returns only public experiments (`isPublic = true`).
- **Success Response (HTTP 200):**
  ```json
  {
    "status": "success",
    "data": {
      "experiments": [ ... ],
      "total": 12,
      "page": 1,
      "limit": 10,
      "totalPages": 2
    }
  }
  ```

---

### 3.2 `POST /api/experiments`
Persists a new experiment and all policy results in an atomic database transaction.

- **Authorization:** Authenticated user session or unassigned (if public).
- **Request Body:**
  ```json
  {
    "name": "Bursty-Stress-10K",
    "workloadType": "High",
    "requestCount": 10000,
    "durationMinutes": 15,
    "slaLatencyThresholdMs": 400,
    "arrivalPattern": "Bursty",
    "seed": 909,
    "weights": { "cost": 0.35, "carbon": 0.25, "latency": 0.25, "coldStart": 0.15 },
    "isPublic": false,
    "policyResults": [ ... ]
  }
  ```
- **Success Response (HTTP 201):** Returns created `ExperimentRecord`.

---

### 3.3 `GET /api/experiments/:id`
Retrieves full experiment details, configuration, and comparative policy results.

- **Authorization:** Allowed if user owns the record OR if record is public. Denies access (HTTP 403) for private cross-user records or unassigned private records.
- **Success Response (HTTP 200):** Returns full `ExperimentRecord`.
- **Error Responses:**
  - `403 Forbidden`: Cross-user private record.
  - `404 Not Found`: Experiment does not exist.

---

### 3.4 `DELETE /api/experiments/:id`
Deletes an experiment and cascades deletion to all associated `PolicyResult` records.

- **Authorization:** Strictly restricted to the verified authenticated owner. Cross-account or unauthenticated deletion attempts return HTTP 403 Forbidden.
- **Success Response (HTTP 200):**
  ```json
  {
    "status": "success",
    "data": {
      "id": "exp-uuid-1234",
      "deleted": true
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Not logged in.
  - `403 Forbidden`: User is not the owner.
  - `404 Not Found`: Experiment does not exist.

---

## 4. Standard Error Response Format

All error responses return a structured JSON object:
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request payload failed schema validation.",
    "details": [
      "Field 'requestCount' must be at least 1."
    ]
  }
}
```

| HTTP Status | Error Code | Description |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Schema validation failure or malformed JSON payload. |
| `401` | `UNAUTHORIZED` | Authentication credentials missing or invalid. |
| `403` | `FORBIDDEN` | Access denied by fail-closed ownership authorization. |
| `404` | `EXPERIMENT_NOT_FOUND` | The requested experiment resource does not exist. |
| `409` | `CONFLICT` | Resource conflict (e.g. duplicate user registration). |
| `429` | `RATE_LIMIT_EXCEEDED` | Request rate limit exceeded for client network key. |
| `503` | `DATABASE_UNAVAILABLE` | Database offline, unreachable, or unconfigured. |
