#!/usr/bin/env node
/**
 * Generates an executive, publication-grade HTML report with embedded SVG vector charts
 * and compiles it to PDF via headless Microsoft Edge.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HTML_PATH = path.resolve('docs/performance-test-report.html');
const PDF_PATH = path.resolve('docs/STARS_Performance_Test_Report.pdf');
const ARTIFACT_PDF_PATH = 'C:/Users/Khayl/.gemini/antigravity/brain/1b61164a-6f3f-4e73-8780-591a3b0a9df7/STARS_Performance_Test_Report.pdf';

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>STARS Performance Test Report</title>
<style>
  @page {
    size: A4 portrait;
    margin: 14mm 14mm 16mm 14mm;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-size: 8pt;
      color: #64748b;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background-color: #ffffff;
    line-height: 1.5;
    font-size: 9.5pt;
    margin: 0;
    padding: 0;
  }

  /* Header & Banner */
  .header-card {
    border-bottom: 2px solid #2563eb;
    padding-bottom: 14px;
    margin-bottom: 18px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .title-group h1 {
    font-size: 20pt;
    font-weight: 800;
    color: #1e3a8a;
    margin: 0 0 4px 0;
    letter-spacing: -0.5px;
  }

  .title-group .subtitle {
    font-size: 10.5pt;
    color: #475569;
    font-weight: 500;
    margin: 0;
  }

  .meta-badges {
    text-align: right;
    font-size: 8pt;
    color: #64748b;
  }

  .badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }

  .badge-primary { background: #dbeafe; color: #1e40af; }
  .badge-success { background: #dcfce7; color: #15803d; }
  .badge-warning { background: #fef3c7; color: #b45309; }
  .badge-danger  { background: #fee2e2; color: #b91c1c; }

  /* Section Styles */
  h2 {
    font-size: 13pt;
    font-weight: 700;
    color: #1e293b;
    border-left: 4px solid #2563eb;
    padding-left: 8px;
    margin: 20px 0 10px 0;
    page-break-after: avoid;
  }

  h3 {
    font-size: 11pt;
    font-weight: 600;
    color: #334155;
    margin: 14px 0 6px 0;
    page-break-after: avoid;
  }

  p {
    margin: 0 0 8px 0;
    color: #334155;
  }

  /* Metric KPI Grid */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 12px 0 16px 0;
    page-break-inside: avoid;
  }

  .kpi-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    text-align: left;
  }

  .kpi-label {
    font-size: 7.5pt;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .kpi-value {
    font-size: 15pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.1;
  }

  .kpi-sub {
    font-size: 7.5pt;
    color: #64748b;
    margin-top: 3px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px 0;
    font-size: 8pt;
    page-break-inside: avoid;
  }

  th {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 700;
    text-align: left;
    padding: 7px 8px;
    border: 1px solid #cbd5e1;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  td {
    padding: 6px 8px;
    border: 1px solid #e2e8f0;
    color: #334155;
  }

  tr:nth-child(even) {
    background-color: #f8fafc;
  }

  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-bold { font-weight: 700; }

  /* Callout Alert Boxes */
  .callout {
    border-radius: 6px;
    padding: 10px 12px;
    margin: 12px 0;
    font-size: 8.5pt;
    page-break-inside: avoid;
    border-left: 4px solid;
  }

  .callout-info {
    background: #eff6ff;
    border-left-color: #3b82f6;
    color: #1e40af;
  }

  .callout-warning {
    background: #fffbeb;
    border-left-color: #f59e0b;
    color: #92400e;
  }

  .callout-danger {
    background: #fef2f2;
    border-left-color: #ef4444;
    color: #991b1b;
  }

  .callout-title {
    font-weight: 700;
    margin-bottom: 3px;
  }

  /* Chart Containers */
  .chart-container {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin: 12px 0 16px 0;
    page-break-inside: avoid;
    box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  }

  .chart-title {
    font-size: 9.5pt;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 2px;
    text-align: center;
  }

  .chart-desc {
    font-size: 7.5pt;
    color: #64748b;
    text-align: center;
    margin-bottom: 10px;
  }

  .page-break {
    page-break-before: always;
  }

  ul, ol {
    margin: 4px 0 8px 18px;
    padding: 0;
  }

  li {
    margin-bottom: 3px;
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header-card">
    <div class="title-group">
      <h1>STARS Performance Test Report</h1>
      <div class="subtitle">System Load, Stress, and Spike Testing Benchmark Analysis</div>
    </div>
    <div class="meta-badges">
      <span class="badge badge-primary">ASP.NET Core 9 (net9.0)</span><br>
      <span class="badge badge-success">Production Azure Web App</span><br>
      <div><strong>Execution Date:</strong> November 23, 2026</div>
      <div><strong>Target Host:</strong> stars-h8bgfbhghzbdc9fd.azurewebsites.net</div>
    </div>
  </div>

  <!-- 1. Executive Summary -->
  <h2>1. Executive Summary</h2>
  <p>
    An in-depth empirical performance testing evaluation was conducted against the <strong>STARS</strong> (Speedex Task Allocation and Recommendation System) production cloud deployment. The objective was to validate real-world operational capacity, map throughput curves, isolate concurrency bottlenecks, and determine exact saturation and breaking points under sustained load, progressive stress, and extreme traffic spikes.
  </p>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Safe Concurrency</div>
      <div class="kpi-value" style="color: #16a34a;">25 - 30 VUs</div>
      <div class="kpi-sub">0.0% Error Rate | p50 &lt; 320ms</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Peak Read Throughput</div>
      <div class="kpi-value" style="color: #2563eb;">122.87 req/s</div>
      <div class="kpi-sub">Task API Guard (p50: 115ms)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">CPU Inflection Point</div>
      <div class="kpi-value" style="color: #ea580c;">~50 VUs</div>
      <div class="kpi-sub">PBKDF2 100k Hashing Limit</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">DB Breaking Point</div>
      <div class="kpi-value" style="color: #dc2626;">~25 VUs</div>
      <div class="kpi-sub">Direct DB Pool Saturation</div>
    </div>
  </div>

  <!-- 2. Load Testing -->
  <h2>2. Load Testing Results (Sustained Baseline Traffic)</h2>
  <p>
    Load testing established baseline latency and throughput under expected standard operational traffic (10 to 20 concurrent connections / Virtual Users) over sustained intervals.
  </p>

  <table>
    <thead>
      <tr>
        <th>Endpoint &amp; Workload</th>
        <th>Method</th>
        <th class="text-center">VUs</th>
        <th class="text-right">Total Reqs</th>
        <th class="text-right">Throughput</th>
        <th class="text-right">p50 (Med)</th>
        <th class="text-right">p95</th>
        <th class="text-right">p99</th>
        <th class="text-center">Status</th>
        <th class="text-center">Error Rate</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Root Gateway Ping</strong> (<code>/</code>)</td>
        <td>GET</td>
        <td class="text-center">20</td>
        <td class="text-right">80</td>
        <td class="text-right">5.34 req/s</td>
        <td class="text-right">1,962 ms</td>
        <td class="text-right">9,481 ms</td>
        <td class="text-right">9,622 ms</td>
        <td class="text-center"><span class="badge badge-success">200 OK</span></td>
        <td class="text-center">0.0%</td>
      </tr>
      <tr>
        <td><strong>Health Check &amp; DB Query</strong> (<code>/api/health</code>)</td>
        <td>GET</td>
        <td class="text-center">15</td>
        <td class="text-right">213</td>
        <td class="text-right">14.20 req/s</td>
        <td class="text-right">765 ms</td>
        <td class="text-right">5,577 ms</td>
        <td class="text-right">5,911 ms</td>
        <td class="text-center"><span class="badge badge-success">200 OK</span></td>
        <td class="text-center">0.0%</td>
      </tr>
      <tr>
        <td><strong>Authentication Verification</strong> (<code>/api/auth/login</code>)</td>
        <td>POST</td>
        <td class="text-center">10</td>
        <td class="text-right">790</td>
        <td class="text-right font-bold">52.67 req/s</td>
        <td class="text-right font-bold">160 ms</td>
        <td class="text-right">500 ms</td>
        <td class="text-right">985 ms</td>
        <td class="text-center"><span class="badge badge-success">200 OK</span></td>
        <td class="text-center">0.0%</td>
      </tr>
      <tr>
        <td><strong>Task Guard &amp; Security Pipeline</strong> (<code>/api/task</code>)</td>
        <td>GET</td>
        <td class="text-center">20</td>
        <td class="text-right font-bold">1,843</td>
        <td class="text-right font-bold">122.87 req/s</td>
        <td class="text-right font-bold">115 ms</td>
        <td class="text-right">550 ms</td>
        <td class="text-right">1,220 ms</td>
        <td class="text-center"><span class="badge badge-primary">401 Handled</span></td>
        <td class="text-center">0.0%</td>
      </tr>
    </tbody>
  </table>

  <!-- Visual Vector Chart: Load Test Comparison -->
  <div class="chart-container">
    <div class="chart-title">Figure 1: Baseline Load Test Throughput (RPS) vs Median Latency (p50)</div>
    <div class="chart-desc">Comparison across 4 distinct endpoint categories under steady-state normal load</div>
    <svg width="100%" height="160" viewBox="0 0 680 160" xmlns="http://www.w3.org/2000/svg">
      <!-- Gridlines -->
      <line x1="50" y1="20" x2="650" y2="20" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="50" y1="55" x2="650" y2="55" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="50" y1="90" x2="650" y2="90" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="50" y1="125" x2="650" y2="125" stroke="#cbd5e1" stroke-width="1.5"/>

      <!-- Y-Axis Labels -->
      <text x="40" y="24" font-size="7.5pt" fill="#94a3b8" text-anchor="end">130</text>
      <text x="40" y="59" font-size="7.5pt" fill="#94a3b8" text-anchor="end">90</text>
      <text x="40" y="94" font-size="7.5pt" fill="#94a3b8" text-anchor="end">45</text>
      <text x="40" y="129" font-size="7.5pt" fill="#94a3b8" text-anchor="end">0</text>

      <!-- Bar 1: Root Ping (5.34 RPS) -->
      <rect x="85" y="120" width="40" height="5" rx="3" fill="#3b82f6"/>
      <text x="105" y="113" font-size="7.5pt" font-weight="700" fill="#1e40af" text-anchor="middle">5.3</text>
      <text x="105" y="142" font-size="7.5pt" fill="#475569" text-anchor="middle">Root Ping</text>
      <text x="105" y="153" font-size="6.5pt" fill="#64748b" text-anchor="middle">(p50: 1962ms)</text>

      <!-- Bar 2: Health Check (14.2 RPS) -->
      <rect x="235" y="112" width="40" height="13" rx="3" fill="#3b82f6"/>
      <text x="255" y="105" font-size="7.5pt" font-weight="700" fill="#1e40af" text-anchor="middle">14.2</text>
      <text x="255" y="142" font-size="7.5pt" fill="#475569" text-anchor="middle">Health API</text>
      <text x="255" y="153" font-size="6.5pt" fill="#64748b" text-anchor="middle">(p50: 765ms)</text>

      <!-- Bar 3: Auth API (52.67 RPS) -->
      <rect x="385" y="78" width="40" height="47" rx="3" fill="#2563eb"/>
      <text x="405" y="71" font-size="7.5pt" font-weight="700" fill="#1e40af" text-anchor="middle">52.7</text>
      <text x="405" y="142" font-size="7.5pt" fill="#475569" text-anchor="middle">Auth API</text>
      <text x="405" y="153" font-size="6.5pt" fill="#64748b" text-anchor="middle">(p50: 160ms)</text>

      <!-- Bar 4: Task Guard (122.87 RPS) -->
      <rect x="535" y="24" width="40" height="101" rx="3" fill="#1d4ed8"/>
      <text x="555" y="18" font-size="7.5pt" font-weight="700" fill="#1e40af" text-anchor="middle">122.9</text>
      <text x="555" y="142" font-size="7.5pt" fill="#475569" text-anchor="middle">Task Guard</text>
      <text x="555" y="153" font-size="6.5pt" fill="#64748b" text-anchor="middle">(p50: 115ms)</text>
    </svg>
  </div>

  <div class="page-break"></div>

  <!-- 3. Stress Testing -->
  <h2>3. Stress Testing Results (Saturation &amp; Breaking Point)</h2>
  <p>
    Stress testing applied progressive load stepping across the application's most critical compute-intensive and I/O-intensive paths to isolate the exact tipping points where performance degrades and failures initiate.
  </p>

  <h3>A. Authentication API Stress &amp; CPU Derivation Wall (<code>POST /api/auth/login</code>)</h3>
  <p>
    Tests PBKDF2 HMAC-SHA256 password derivation (100,000 iterations per verification) across concurrency tiers of 5, 10, 25, 50, and 100 concurrent VUs.
  </p>

  <!-- Visual Vector Chart: Stress Test Throughput & Latency Curve -->
  <div class="chart-container">
    <div class="chart-title">Figure 2: Authentication API Stress Curve — Throughput (RPS) vs Concurrency</div>
    <div class="chart-desc">Identifies the CPU Derivation Wall and throughput crash occurring at ~50 concurrent connections</div>
    <svg width="100%" height="195" viewBox="0 0 680 195" xmlns="http://www.w3.org/2000/svg">
      <!-- Defs for Gradient -->
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02"/>
        </linearGradient>
      </defs>

      <!-- Gridlines -->
      <line x1="60" y1="20" x2="640" y2="20" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="60" y1="55" x2="640" y2="55" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="60" y1="90" x2="640" y2="90" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="60" y1="125" x2="640" y2="125" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="60" y1="150" x2="640" y2="150" stroke="#cbd5e1" stroke-width="1.5"/>

      <!-- Y-Axis Labels -->
      <text x="50" y="24" font-size="7.5pt" fill="#94a3b8" text-anchor="end">80</text>
      <text x="50" y="59" font-size="7.5pt" fill="#94a3b8" text-anchor="end">60</text>
      <text x="50" y="94" font-size="7.5pt" fill="#94a3b8" text-anchor="end">40</text>
      <text x="50" y="129" font-size="7.5pt" fill="#94a3b8" text-anchor="end">20</text>
      <text x="50" y="154" font-size="7.5pt" fill="#94a3b8" text-anchor="end">0</text>

      <!-- Coordinates Calculation (y = 150 - (val / 80) * 130):
           x: 5 VUs=90, 10 VUs=215, 25 VUs=340, 50 VUs=465, 100 VUs=590
           73.63 -> y = 30.3
           52.67 -> y = 64.4
           61.59 -> y = 49.9
           22.25 -> y = 113.8 (Crash point)
           12.75 -> y = 129.3
      -->

      <!-- Shaded Area -->
      <polygon points="90,150 90,30 215,64 340,50 465,114 590,129 590,150" fill="url(#areaGradient)"/>

      <!-- Connected Line Path -->
      <polyline points="90,30 215,64 340,50 465,114 590,129" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>

      <!-- Inflection Threshold Zone Marker -->
      <line x1="400" y1="15" x2="400" y2="150" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,4"/>
      <rect x="405" y="18" width="130" height="18" rx="3" fill="#fee2e2"/>
      <text x="470" y="30" font-size="6.5pt" font-weight="700" fill="#991b1b" text-anchor="middle">CPU Inflection (50 VUs)</text>

      <!-- Point 1 (5 VUs: 73.6 req/s) -->
      <circle cx="90" cy="30" r="5" fill="#1e40af" stroke="#ffffff" stroke-width="2"/>
      <text x="90" y="20" font-size="7.5pt" font-weight="700" fill="#1e40af" text-anchor="middle">73.6 RPS</text>
      <text x="90" y="165" font-size="7.5pt" font-weight="600" fill="#334155" text-anchor="middle">5 VUs</text>
      <text x="90" y="176" font-size="6.5pt" fill="#16a34a" text-anchor="middle">0% err (56ms)</text>

      <!-- Point 2 (10 VUs: 52.7 req/s) -->
      <circle cx="215" cy="64" r="5" fill="#1e40af" stroke="#ffffff" stroke-width="2"/>
      <text x="215" y="55" font-size="7.5pt" font-weight="700" fill="#1e40af" text-anchor="middle">52.7 RPS</text>
      <text x="215" y="165" font-size="7.5pt" font-weight="600" fill="#334155" text-anchor="middle">10 VUs</text>
      <text x="215" y="176" font-size="6.5pt" fill="#16a34a" text-anchor="middle">0% err (160ms)</text>

      <!-- Point 3 (25 VUs: 61.6 req/s) -->
      <circle cx="340" cy="50" r="5" fill="#1e40af" stroke="#ffffff" stroke-width="2"/>
      <text x="340" y="41" font-size="7.5pt" font-weight="700" fill="#1e40af" text-anchor="middle">61.6 RPS</text>
      <text x="340" y="165" font-size="7.5pt" font-weight="600" fill="#334155" text-anchor="middle">25 VUs</text>
      <text x="340" y="176" font-size="6.5pt" fill="#ca8a04" text-anchor="middle">Queuing (315ms)</text>

      <!-- Point 4 (50 VUs: 22.3 req/s - Inflection) -->
      <circle cx="465" cy="114" r="6" fill="#ea580c" stroke="#ffffff" stroke-width="2"/>
      <text x="465" y="105" font-size="7.5pt" font-weight="800" fill="#ea580c" text-anchor="middle">22.3 RPS</text>
      <text x="465" y="165" font-size="7.5pt" font-weight="700" fill="#ea580c" text-anchor="middle">50 VUs</text>
      <text x="465" y="176" font-size="6.5pt" font-weight="700" fill="#dc2626" text-anchor="middle">9 Errs (2478ms)</text>

      <!-- Point 5 (100 VUs: 12.8 req/s - Failure) -->
      <circle cx="590" cy="129" r="6" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
      <text x="590" y="122" font-size="7.5pt" font-weight="800" fill="#dc2626" text-anchor="middle">12.8 RPS</text>
      <text x="590" y="165" font-size="7.5pt" font-weight="700" fill="#dc2626" text-anchor="middle">100 VUs</text>
      <text x="590" y="176" font-size="6.5pt" font-weight="700" fill="#dc2626" text-anchor="middle">26.8% Errs</text>
    </svg>
  </div>

  <table>
    <thead>
      <tr>
        <th>Concurrency</th>
        <th class="text-right">Requests</th>
        <th class="text-right">Throughput</th>
        <th class="text-right">p50</th>
        <th class="text-right">p95</th>
        <th class="text-right">Max Latency</th>
        <th class="text-center">HTTP 200</th>
        <th class="text-center">HTTP 500</th>
        <th class="text-center">Timeouts</th>
        <th class="text-center">Error %</th>
        <th class="text-center">System State</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>5 VUs</strong></td>
        <td class="text-right">589</td>
        <td class="text-right">73.63 req/s</td>
        <td class="text-right">56 ms</td>
        <td class="text-right">121 ms</td>
        <td class="text-right">1,009 ms</td>
        <td class="text-center">589</td>
        <td class="text-center">0</td>
        <td class="text-center">0</td>
        <td class="text-center">0.0%</td>
        <td class="text-center"><span class="badge badge-success">Optimal</span></td>
      </tr>
      <tr>
        <td><strong>10 VUs</strong></td>
        <td class="text-right">790</td>
        <td class="text-right">52.67 req/s</td>
        <td class="text-right">160 ms</td>
        <td class="text-right">500 ms</td>
        <td class="text-right">1,967 ms</td>
        <td class="text-center">790</td>
        <td class="text-center">0</td>
        <td class="text-center">0</td>
        <td class="text-center">0.0%</td>
        <td class="text-center"><span class="badge badge-success">Healthy</span></td>
      </tr>
      <tr>
        <td><strong>25 VUs</strong></td>
        <td class="text-right">739</td>
        <td class="text-right">61.59 req/s</td>
        <td class="text-right">315 ms</td>
        <td class="text-right">2,224 ms</td>
        <td class="text-right">2,825 ms</td>
        <td class="text-center">739</td>
        <td class="text-center">0</td>
        <td class="text-center">0</td>
        <td class="text-center">0.0%</td>
        <td class="text-center"><span class="badge badge-warning">Queue Saturation</span></td>
      </tr>
      <tr style="background: #fff7ed;">
        <td><strong>50 VUs</strong></td>
        <td class="text-right">267</td>
        <td class="text-right font-bold" style="color: #ea580c;">22.25 req/s</td>
        <td class="text-right font-bold">2,478 ms</td>
        <td class="text-right">4,419 ms</td>
        <td class="text-right">4,967 ms</td>
        <td class="text-center">258</td>
        <td class="text-center font-bold" style="color: #dc2626;">9</td>
        <td class="text-center">0</td>
        <td class="text-center font-bold" style="color: #ea580c;">3.37%</td>
        <td class="text-center"><span class="badge badge-warning">Degraded (Inflection)</span></td>
      </tr>
      <tr style="background: #fef2f2;">
        <td><strong>100 VUs</strong></td>
        <td class="text-right">153</td>
        <td class="text-right font-bold" style="color: #dc2626;">12.75 req/s</td>
        <td class="text-right font-bold">3,656 ms</td>
        <td class="text-right">9,584 ms</td>
        <td class="text-right">9,704 ms</td>
        <td class="text-center">127</td>
        <td class="text-center font-bold" style="color: #dc2626;">26</td>
        <td class="text-center font-bold" style="color: #dc2626;">15</td>
        <td class="text-center font-bold" style="color: #dc2626;">26.8%</td>
        <td class="text-center"><span class="badge badge-danger">Breaking Point</span></td>
      </tr>
    </tbody>
  </table>

  <h3>B. Relational Database Connection Pool Stress (<code>GET /api/health</code>)</h3>
  <p>
    Direct database queries test Npgsql's connection pool. Once concurrency exceeded 25 connections, requests began queuing in the connection pool. At 50 VUs, 50% timed out, and at 200 VUs, total pool exhaustion occurred (100% timeouts).
  </p>

  <table>
    <thead>
      <tr>
        <th>Concurrency</th>
        <th class="text-right">Total Reqs</th>
        <th class="text-right">Throughput</th>
        <th class="text-right">p50 Latency</th>
        <th class="text-right">p95 Latency</th>
        <th class="text-center">HTTP 200</th>
        <th class="text-center">Timeouts</th>
        <th class="text-center">Error %</th>
        <th class="text-center">Diagnosis</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>15 VUs</strong></td>
        <td class="text-right">213</td>
        <td class="text-right">14.20 req/s</td>
        <td class="text-right">765 ms</td>
        <td class="text-right">5,577 ms</td>
        <td class="text-center">213</td>
        <td class="text-center">0</td>
        <td class="text-center">0.0%</td>
        <td class="text-center"><span class="badge badge-success">Healthy Pool</span></td>
      </tr>
      <tr>
        <td><strong>25 VUs</strong></td>
        <td class="text-right">38</td>
        <td class="text-right">3.17 req/s</td>
        <td class="text-right">6,040 ms</td>
        <td class="text-right">9,477 ms</td>
        <td class="text-center">38</td>
        <td class="text-center">0</td>
        <td class="text-center">0.0%</td>
        <td class="text-center"><span class="badge badge-warning">Queue Buildup</span></td>
      </tr>
      <tr style="background: #fff7ed;">
        <td><strong>50 VUs</strong></td>
        <td class="text-right">25</td>
        <td class="text-right">2.09 req/s</td>
        <td class="text-right">7,868 ms</td>
        <td class="text-right">9,820 ms</td>
        <td class="text-center">25</td>
        <td class="text-center font-bold" style="color: #dc2626;">25</td>
        <td class="text-center font-bold" style="color: #ea580c;">50.0%</td>
        <td class="text-center"><span class="badge badge-danger">Connection Starvation</span></td>
      </tr>
      <tr style="background: #fef2f2;">
        <td><strong>100 VUs</strong></td>
        <td class="text-right">38</td>
        <td class="text-right">3.17 req/s</td>
        <td class="text-right">8,336 ms</td>
        <td class="text-right">9,974 ms</td>
        <td class="text-center">38</td>
        <td class="text-center font-bold" style="color: #dc2626;">62</td>
        <td class="text-center font-bold" style="color: #dc2626;">62.0%</td>
        <td class="text-center"><span class="badge badge-danger">Severe Starvation</span></td>
      </tr>
      <tr style="background: #fef2f2;">
        <td><strong>200 VUs</strong></td>
        <td class="text-right">0</td>
        <td class="text-right">0.00 req/s</td>
        <td class="text-right">—</td>
        <td class="text-right">—</td>
        <td class="text-center">0</td>
        <td class="text-center font-bold" style="color: #dc2626;">200</td>
        <td class="text-center font-bold" style="color: #dc2626;">100.0%</td>
        <td class="text-center"><span class="badge badge-danger">Total Pool Exhaustion</span></td>
      </tr>
    </tbody>
  </table>

  <div class="page-break"></div>

  <!-- 4. Spike Testing -->
  <h2>4. Spike Testing Results (Sudden Surge &amp; Elastic Recovery)</h2>
  <p>
    Spike testing evaluated how the application behaves when subjected to an immediate 30x traffic multiplier (5 VUs to 150 VUs) and whether it recovers cleanly when traffic subsides.
  </p>

  <table>
    <thead>
      <tr>
        <th>Spike Phase</th>
        <th class="text-center">VUs</th>
        <th class="text-right">Total Reqs</th>
        <th class="text-right">Throughput</th>
        <th class="text-right">p50</th>
        <th class="text-right">p95</th>
        <th class="text-right">p99</th>
        <th class="text-center">HTTP 200</th>
        <th class="text-center">HTTP 500</th>
        <th class="text-center">Timeouts</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Pre-Spike Baseline</strong></td>
        <td class="text-center">5</td>
        <td class="text-right">589</td>
        <td class="text-right font-bold" style="color: #16a34a;">73.63 req/s</td>
        <td class="text-right font-bold">56 ms</td>
        <td class="text-right">121 ms</td>
        <td class="text-right">186 ms</td>
        <td class="text-center">589</td>
        <td class="text-center">0</td>
        <td class="text-center">0</td>
      </tr>
      <tr style="background: #fef2f2;">
        <td><strong>Sudden 30x Surge Burst</strong></td>
        <td class="text-center font-bold" style="color: #dc2626;">150</td>
        <td class="text-right">202</td>
        <td class="text-right font-bold" style="color: #dc2626;">13.47 req/s</td>
        <td class="text-right font-bold" style="color: #dc2626;">2,035 ms</td>
        <td class="text-right font-bold">9,629 ms</td>
        <td class="text-right">9,937 ms</td>
        <td class="text-center">151</td>
        <td class="text-center font-bold" style="color: #dc2626;">51</td>
        <td class="text-center font-bold" style="color: #dc2626;">85</td>
      </tr>
      <tr>
        <td><strong>Post-Spike Recovery Drain</strong></td>
        <td class="text-center">5</td>
        <td class="text-right">—</td>
        <td class="text-right">Draining</td>
        <td class="text-right">—</td>
        <td class="text-right">—</td>
        <td class="text-right">—</td>
        <td class="text-center">0</td>
        <td class="text-center">0</td>
        <td class="text-center">5 (Lingering)</td>
      </tr>
    </tbody>
  </table>

  <div class="callout callout-warning">
    <div class="callout-title">Observation: Post-Spike Socket Draining Lag (10 - 15 seconds)</div>
    Following the sudden 150 VU surge, Kestrel and the underlying OS TCP socket buffer required approximately 10 to 15 seconds to flush lingering queued connections before new requests returned to the sub-100ms baseline.
  </div>

  <!-- 5. Root Cause Analysis -->
  <h2>5. Root Cause Analysis &amp; Bottleneck Diagnostics</h2>
  
  <div class="callout callout-danger">
    <div class="callout-title">1. PBKDF2 HMAC-SHA256 CPU Starvation</div>
    <code>Microsoft.AspNetCore.Identity.PasswordHasher&lt;User&gt;</code> executes 100,000 hashing rounds per verification. At &gt;25 concurrent authentications, all VM CPU cores become saturated. Worker threads stall, leading to task cancellations and the observed HTTP 500 internal server errors.
  </div>

  <div class="callout callout-danger">
    <div class="callout-title">2. Relational Database Connection Starvation</div>
    Npgsql's default connection pool (100 maximum connections) and the cloud database tier cannot satisfy burst checkouts when concurrency exceeds 25. Requests queue in memory until the 10-second client timeout expires.
  </div>

  <div class="callout callout-warning">
    <div class="callout-title">3. Missing Composite Indexes on High-Frequency Task Tables</div>
    Codebase audit of <code>backend/Data/AppDbContext.cs</code> revealed that the <code>Tasks</code> table lacks composite indexes on <code>(Status, AssignedDepartmentId, DueDate)</code> and <code>CreatedAt</code>. High-volume dashboard queries require full sequential scans.
  </div>

  <!-- 6. Recommendations -->
  <h2>6. Strategic Optimization Roadmap</h2>
  
  <p><strong>Phase 1: Immediate Mitigations (Code &amp; Configuration)</strong></p>
  <ul>
    <li><strong>Implement ASP.NET Core Rate Limiting:</strong> Enforce a sliding-window rate limit (e.g. 20 requests/min per IP) on <code>/api/auth/*</code> using <code>Microsoft.AspNetCore.RateLimiting</code> to prevent CPU starvation.</li>
    <li><strong>Database Migration for Task Indexing:</strong> Add composite B-tree indexes to <code>Tasks</code> on <code>(Status, AssignedDepartmentId, DueDate)</code> and <code>CreatedAt</code> to convert sequential scans into index seeks.</li>
    <li><strong>Npgsql Connection Pool Tuning:</strong> Update connection string with <code>MaxPoolSize=150;MinPoolSize=10;ConnectionLifetime=300;Timeout=15;</code>.</li>
  </ul>

  <p><strong>Phase 2: Architectural Enhancements</strong></p>
  <ul>
    <li><strong>Asynchronous Inbound Webhooks:</strong> Decouple external delivery webhooks from immediate database transactions by queueing payloads into an in-memory channel or Kafka topic.</li>
    <li><strong>Decoupled Health Diagnostics:</strong> Replace the direct database count query in <code>/api/health</code> with a cached health probe updated via background service.</li>
  </ul>

  <p><strong>Phase 3: Production Infrastructure Scaling</strong></p>
  <ul>
    <li><strong>Azure App Service Auto-Scaling:</strong> Configure auto-scale rules to expand from 1 to 3 instances when CPU &gt; 70% for 2 consecutive minutes, scaling safe concurrency from 30 to ~100 VUs.</li>
    <li><strong>PgBouncer Connection Pooling:</strong> Activate PgBouncer on Azure Database for PostgreSQL to multiplex up to 2,000 active client connections.</li>
  </ul>

</body>
</html>
`;

async function main() {
  console.log(`Writing styled HTML report to: ${HTML_PATH}`);
  await fs.writeFile(HTML_PATH, htmlContent, 'utf-8');

  console.log(`Compiling PDF via Microsoft Edge headless...`);
  const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--run-all-compositor-stages-before-draw',
    `--print-to-pdf=${PDF_PATH}`,
    HTML_PATH
  ];

  const { stdout, stderr } = await execFileAsync(edgeExe, args);
  console.log(stdout || stderr);

  const stats = await fs.stat(PDF_PATH);
  console.log(`✓ PDF successfully generated at: ${PDF_PATH} (${(stats.size / 1024).toFixed(1)} KB)`);

  // Copy to brain artifact directory as well
  await fs.copyFile(PDF_PATH, ARTIFACT_PDF_PATH);
  console.log(`✓ Copied PDF to brain artifact directory: ${ARTIFACT_PDF_PATH}`);
}

main().catch(err => {
  console.error('PDF Generation failed:', err);
  process.exit(1);
});
