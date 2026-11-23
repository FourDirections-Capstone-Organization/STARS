#!/usr/bin/env node
/**
 * STARS Application Performance Test Runner
 * Executes Load, Stress, and Spike tests using autocannon
 * Captures granular latency, throughput, error rates, and percentile metrics.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

const BASE_URL = process.env.STARS_API_URL || 'https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net';
const DMS_KEY = process.env.DMS_TO_STARS_KEY || 'af4a0af7cd3651300fe515623a28481421d93b3324715a87ab8d4aed5887514a';

const OUTPUT_DIR = path.resolve('docs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'performance-test-results.json');

console.log('='.repeat(80));
console.log(`STARS PERFORMANCE TESTING SUITE`);
console.log(`Target Host: ${BASE_URL}`);
console.log(`Timestamp:   ${new Date().toISOString()}`);
console.log('='.repeat(80));

/**
 * Runs autocannon via npx and parses json output
 */
async function runBenchmark({ name, category, url, method = 'GET', connections = 10, duration = 10, headers = {}, body = null }) {
  console.log(`\n▶ [${category.toUpperCase()}] Running: ${name}`);
  console.log(`  URL: ${url} | Method: ${method} | Connections: ${connections} | Duration: ${duration}s`);

  let cmd = `npx --yes autocannon -c ${connections} -d ${duration} -m ${method} -j`;
  for (const [k, v] of Object.entries(headers)) {
    cmd += ` -H "${k}=${v}"`;
  }
  if (body) {
    const escapedBody = JSON.stringify(body).replace(/"/g, '\\"');
    cmd += ` -b "${escapedBody}"`;
  }
  cmd += ` "${url}"`;

  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) {
      throw new Error(`Invalid JSON output: ${stdout || stderr}`);
    }
    const rawJson = stdout.slice(jsonStart);
    const data = JSON.parse(rawJson);

    const summary = {
      name,
      category,
      method,
      url,
      connections,
      duration: data.duration,
      totalRequests: data.requests?.total ?? 0,
      reqPerSec: Math.round((data.requests?.average ?? 0) * 100) / 100,
      throughputBytesPerSec: Math.round(data.throughput?.average ?? 0),
      latency: {
        avg: Math.round((data.latency?.average ?? 0) * 100) / 100,
        min: data.latency?.min ?? 0,
        p50: data.latency?.p50 ?? 0,
        p90: data.latency?.p90 ?? 0,
        p95: data.latency?.p97_5 ?? data.latency?.p90 ?? 0, // autocannon gives p97_5
        p99: data.latency?.p99 ?? 0,
        max: data.latency?.max ?? 0,
        stddev: Math.round((data.latency?.stddev ?? 0) * 100) / 100,
      },
      errors: data.errors ?? 0,
      timeouts: data.timeouts ?? 0,
      non2xx: data.non2xx ?? 0,
      statusCodes: data.statusCodeStats || {},
    };

    console.log(`  ✓ Completed: ${summary.totalRequests} reqs | ${summary.reqPerSec} req/s | p50: ${summary.latency.p50}ms | p95: ${summary.latency.p95}ms | p99: ${summary.latency.p99}ms | Errors: ${summary.errors + summary.timeouts}`);
    return summary;
  } catch (err) {
    console.error(`  ✗ Benchmark Failed: ${err.message}`);
    return {
      name,
      category,
      method,
      url,
      connections,
      duration,
      error: err.message,
    };
  }
}

async function main() {
  const allResults = {
    testRunTimestamp: new Date().toISOString(),
    targetHost: BASE_URL,
    loadTests: [],
    stressTests: [],
    spikeTests: [],
  };

  // =========================================================================
  // 1. LOAD TESTS (Steady state normal-to-moderate traffic)
  // =========================================================================
  console.log('\n==================================================');
  console.log('PHASE 1: LOAD TESTING (Steady Normal Load, 15-25 VUs)');
  console.log('==================================================');

  // Test 1.1: Root Ping
  allResults.loadTests.push(await runBenchmark({
    name: 'Root Gateway Endpoint (Lightweight Ping)',
    category: 'Load',
    url: `${BASE_URL}/`,
    method: 'GET',
    connections: 20,
    duration: 15,
  }));

  // Test 1.2: Health Check (DB Connectivity & Foms Table Count)
  allResults.loadTests.push(await runBenchmark({
    name: 'Health Check API (DB Ping & Table Count)',
    category: 'Load',
    url: `${BASE_URL}/api/health`,
    method: 'GET',
    connections: 15,
    duration: 15,
  }));

  // Test 1.3: Auth Login (PBKDF2 Hashing Cycle)
  allResults.loadTests.push(await runBenchmark({
    name: 'Authentication API (PBKDF2 Password Verification)',
    category: 'Load',
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
    connections: 10,
    duration: 15,
    headers: { 'Content-Type': 'application/json' },
    body: { identifier: 'benchmark_load_user@speedex.com', password: 'Password123!' },
  }));

  // Test 1.4: Inbound DMS Webhook Ingestion
  allResults.loadTests.push(await runBenchmark({
    name: 'DMS Inbound Webhook Status Ingestion',
    category: 'Load',
    url: `${BASE_URL}/api/integration/dms/status`,
    method: 'POST',
    connections: 10,
    duration: 15,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': DMS_KEY },
    body: {
      waybillNo: 'SPX-LOAD-TEST-001',
      starsTaskId: '00000000-0000-0000-0000-000000000001',
      status: 'InTransit',
      updatedAt: new Date().toISOString(),
    },
  }));

  // Test 1.5: Protected Task Query (JWT Guard Enforcement)
  allResults.loadTests.push(await runBenchmark({
    name: 'Task API Guard (JWT Authorization Enforcement)',
    category: 'Load',
    url: `${BASE_URL}/api/task?pageNumber=1&pageSize=10`,
    method: 'GET',
    connections: 20,
    duration: 15,
  }));

  // =========================================================================
  // 2. STRESS TESTS (Stepwise Concurrency Ramping)
  // =========================================================================
  console.log('\n==================================================');
  console.log('PHASE 2: STRESS TESTING (Progressive Load Ramping: 25 -> 50 -> 100 -> 200 VUs)');
  console.log('==================================================');

  // Stress on Health API (DB Connection Saturation)
  for (const c of [25, 50, 100, 200]) {
    allResults.stressTests.push(await runBenchmark({
      name: `Health Check DB Stress - ${c} Concurrency`,
      category: 'Stress',
      url: `${BASE_URL}/api/health`,
      method: 'GET',
      connections: c,
      duration: 12,
    }));
  }

  // Stress on Auth API (CPU / ThreadPool Saturation via PBKDF2)
  for (const c of [10, 25, 50, 100]) {
    allResults.stressTests.push(await runBenchmark({
      name: `Auth API PBKDF2 Stress - ${c} Concurrency`,
      category: 'Stress',
      url: `${BASE_URL}/api/auth/login`,
      method: 'POST',
      connections: c,
      duration: 12,
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: `stress_user_${c}@speedex.com`, password: 'StressTestPassword123!' },
    }));
  }

  // Stress on Webhook Ingestion API
  for (const c of [10, 30, 60, 120]) {
    allResults.stressTests.push(await runBenchmark({
      name: `Webhook Ingestion Stress - ${c} Concurrency`,
      category: 'Stress',
      url: `${BASE_URL}/api/integration/dms/status`,
      method: 'POST',
      connections: c,
      duration: 12,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': DMS_KEY },
      body: {
        waybillNo: `SPX-STRESS-${c}`,
        starsTaskId: '00000000-0000-0000-0000-000000000001',
        status: 'InTransit',
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  // =========================================================================
  // 3. SPIKE TESTS (Sudden Extreme Traffic Burst & Recovery)
  // =========================================================================
  console.log('\n==================================================');
  console.log('PHASE 3: SPIKE TESTING (Baseline 5 VUs -> Sudden Surge 250 VUs -> Recovery 5 VUs)');
  console.log('==================================================');

  // Pre-spike Baseline
  allResults.spikeTests.push(await runBenchmark({
    name: 'Pre-Spike Health Check Baseline (5 VUs)',
    category: 'Spike - Baseline',
    url: `${BASE_URL}/api/health`,
    method: 'GET',
    connections: 5,
    duration: 8,
  }));

  // Immediate Extreme Spike
  allResults.spikeTests.push(await runBenchmark({
    name: 'Sudden Traffic Surge (250 VUs Burst)',
    category: 'Spike - Surge',
    url: `${BASE_URL}/api/health`,
    method: 'GET',
    connections: 250,
    duration: 15,
  }));

  // Immediate Post-spike Recovery Observation
  allResults.spikeTests.push(await runBenchmark({
    name: 'Post-Spike Health Check Recovery (5 VUs)',
    category: 'Spike - Recovery',
    url: `${BASE_URL}/api/health`,
    method: 'GET',
    connections: 5,
    duration: 10,
  }));

  // Auth Burst Spike
  allResults.spikeTests.push(await runBenchmark({
    name: 'Pre-Spike Auth Baseline (5 VUs)',
    category: 'Spike - Baseline',
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
    connections: 5,
    duration: 8,
    headers: { 'Content-Type': 'application/json' },
    body: { identifier: 'spike_base@speedex.com', password: 'Password123!' },
  }));

  allResults.spikeTests.push(await runBenchmark({
    name: 'Sudden Auth Surge (150 VUs Burst)',
    category: 'Spike - Surge',
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
    connections: 150,
    duration: 15,
    headers: { 'Content-Type': 'application/json' },
    body: { identifier: 'spike_surge@speedex.com', password: 'Password123!' },
  }));

  allResults.spikeTests.push(await runBenchmark({
    name: 'Post-Spike Auth Recovery (5 VUs)',
    category: 'Spike - Recovery',
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
    connections: 5,
    duration: 10,
    headers: { 'Content-Type': 'application/json' },
    body: { identifier: 'spike_recovery@speedex.com', password: 'Password123!' },
  }));

  // Write results to JSON
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`\n==================================================`);
  console.log(`✓ All performance tests completed successfully!`);
  console.log(`Metrics written to: ${OUTPUT_FILE}`);
  console.log(`==================================================\n`);
}

main().catch(err => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
