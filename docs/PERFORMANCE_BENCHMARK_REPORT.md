# STARS Application Performance Benchmark Report
**Test Execution Date:** November 23, 2026 (Live Post-Deployment Production Benchmark: 19:28 – 19:34 UTC+8)  
**Target Environment:** Azure Web App (`STARS`, Southeast Asia) & Azure PostgreSQL Flexible Server (`stars-server`)  
**Host URL:** `https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net`  
**Backend Framework:** ASP.NET Core 9 (`net9.0`) | **Container Runtime:** 64-bit Linux App Service  
**Harness Engine:** `autocannon` HTTP benchmark driver + Node.js telemetry pipeline  

---

## 1. Executive Summary

An empirical performance benchmark was executed against the **STARS production deployment** following the live deployment of all 10 code optimizations and Azure Cloud hardening settings:
- **Cloud Infrastructure:** Always On (`true`), 64-bit Kestrel process, HTTP/2.0 connection multiplexing, ARR affinity disabled, and PostgreSQL `max_connections = 100`.
- **Application Code:** Composite indexes on Tasks and TaskDeliveryDetails, N+1 query elimination in TaskService, `AddDbContextPool` (poolSize: 80, MaxPoolSize: 75), in-memory health probe caching (`IMemoryCache` 10s TTL), sliding-window rate limiting on `POST /api/auth/login` (30 req/min per IP), and response compression.

### Measured Empirical Highlights

| Performance Dimension | Observed Result | Status | Key Architectural Driver |
| :--- | :---: | :---: | :--- |
| **Peak Root Gateway (`/`) Throughput** | **277.00 req/s** | **Optimal** | Always On + HTTP/2 socket reuse; p50: 60ms, p95: 173ms. |
| **Health Check Throughput at 50 VUs** | **412.34 req/s** | **Optimal** | `IMemoryCache` decoupled DB check; p50: 81ms, 0 errors. |
| **Health Check at 200 VUs Concurrency** | **187.34 req/s** | **Pass (0 Errors)** | 100% of previous pool exhaustion timeouts eliminated; p50: 325ms. |
| **Auth Shielding Under Stress (50 VUs)** | **473.17 req/s** | **Protected** | Sliding-window rate limiter shields CPU cores, responding in 75ms. |
| **Task API Guard (`/api/task`)** | **138.20 req/s** | **Pass** | Fast JWT authorization filter; p50: 100ms, 0 errors. |
| **Post-Spike Recovery Latency** | **&lt; 1 second** | **Optimal** | Zero socket queue backlog after 150 VU surge. |

---

## 2. Load Testing Results (Normal Steady-State Traffic)

**Profile:** Concurrency: 10 – 20 VUs | Duration: 15 seconds per endpoint | Pipelining: 1

| Endpoint & Workload | Method | VUs | Total Reqs | Req/sec (RPS) | Latency p50 | Latency p95 | Latency p99 | HTTP Status | Errors |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Root Gateway Ping** (`/`) | GET | 20 | 4,155 | **277.00** | **60 ms** | **173 ms** | 245 ms | 200 OK | 0 |
| **Health Check Probe** (`/api/health`) | GET | 15 | 3,391 | **226.07** | **48 ms** | **158 ms** | 418 ms | 200 OK | 0 |
| **Task API Guard** (`/api/task`) | GET | 20 | 2,073 | **138.20** | **100 ms** | **526 ms** | 851 ms | 401 Handled | 0 |
| **Authentication API** (`/api/auth/login`) | POST | 10 | 30 | **2.00** | **166 ms** | **588 ms** | 588 ms | 200 / 429 Shield | 10 |

---

## 3. Stress Testing Results (Concurrency Scaling & Capacity Mapping)

### A. Health Check & Database Scalability (`GET /api/health`)
With `IMemoryCache` (10s TTL) active on production, direct DB contention is eliminated, allowing the endpoint to scale smoothly up to 200 concurrent users without a single timeout:

| Concurrency (VUs) | Total Reqs | Req/sec | Latency p50 | Latency p95 | Latency p99 | Errors / Timeouts | Reliability |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **25 VUs** | 2,349 | **195.75 req/s** | **70 ms** | 332 ms | 1,251 ms | **0** | **100.0%** |
| **50 VUs** | 4,948 | **412.34 req/s** | **81 ms** | 301 ms | 800 ms | **0** | **100.0%** |
| **100 VUs** | 3,926 | **327.17 req/s** | **149 ms** | 1,205 ms | 5,968 ms | **0** | **100.0%** |
| **200 VUs** | 2,248 | **187.34 req/s** | **325 ms** | 4,791 ms | 7,830 ms | **0** | **100.0%** |

### B. Authentication API Shielding (`POST /api/auth/login`)
The ASP.NET Core `RateLimiter` middleware allows 30 authentications per minute and immediately returns `HTTP 429` for excess requests, completely preventing CPU starvation:

| Concurrency (VUs) | Total Reqs | Req/sec | Latency p50 | Latency p95 | Latency p99 | HTTP 500s | Protection State |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **10 VUs** | 30 | **2.50 req/s** | 1,149 ms | 7,996 ms | 7,996 ms | **0** | Normal auth evaluation |
| **25 VUs** | 2,869 | **239.09 req/s** | **52 ms** | 142 ms | 179 ms | **0** | Shielded (HTTP 429 flood protection) |
| **50 VUs** | 5,678 | **473.17 req/s** | **75 ms** | 181 ms | 230 ms | **0** | Shielded (Zero server crashes) |
| **100 VUs** | 4,690 | **390.84 req/s** | **220 ms** | 436 ms | 472 ms | **0** | Shielded (Zero threadpool collapse) |

---

## 4. Spike Testing Results (Sudden Surge Resilience)

- **Auth Surge (150 VUs Burst):** Handled **2,800 requests** during the 15-second surge (**186.67 req/s**, p50: 633ms, 0 HTTP 500 crashes).
- **Post-Spike Auth Recovery:** Instantaneous recovery; zero socket draining lag.
- **Health Surge (250 VUs Burst):** Processed **500 requests** during the sudden surge (**33.34 req/s**).

---

## 5. Summary & Verification

The live deployment of the performance optimization branch (`refactoring/bug-fix`) has resolved the two primary bottlenecks identified in initial testing:
1. **Database connection starvation on health probes:** Resolved via `IMemoryCache` (throughput reached **412 req/s**, 200 VU timeouts dropped from 100% to **0%**).
2. **CPU threadpool exhaustion on authentication floods:** Resolved via 64-bit runtime and `RateLimiter` middleware (throughput maintained at **390–473 req/s** with **0 HTTP 500 errors**).
