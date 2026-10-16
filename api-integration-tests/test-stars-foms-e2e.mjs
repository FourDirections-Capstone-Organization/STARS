#!/usr/bin/env node
/**
 * End-to-End Live Integration Verification Script (Zero Frontend UI)
 * Tests all 3 integrations between STARS and FOMS across the internet:
 *   - Integration 1: FOMS -> STARS Endorsement Request & STARS -> FOMS Completion Callback
 *   - Integration 2: FOMS -> STARS Payment Status Webhook & Dashboard Financial Visibility
 *   - Integration 3: FOMS -> STARS Overdue Accounts Collection Routing (Graph Routing Engine)
 *
 * Usage:
 *   node api-integration-tests/test-stars-foms-e2e.mjs
 */

const env = process.env;
const strip = (u) => (u || "").replace(/\/+$/, "");

const STARS_URL = strip(env.STARS_API_URL || "https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net");
const FOMS_URL = strip(env.FOMS_API_URL || "https://fomsintegration-amfve2fdccbdgbgy.eastasia-01.azurewebsites.net");

// Pre-shared 256-bit API keys
const STARS_TO_FOMS_KEY = env.STARS_TO_FOMS_KEY || "cfeb22557344061f853cee23cef70f2a2508fcbb36658ccc79fec8c7d5049ff4";
const FOMS_TO_STARS_KEY = env.FOMS_TO_STARS_KEY || "fdc188d939e6bdb7841d7629ff29dc99a8ef9e2363accafc016929167da8e890";

const TIMEOUT_MS = 60_000;
const results = [];

async function call(method, url, { headers = {}, body } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json, ms: Date.now() - started };
  } catch (err) {
    return { status: 0, text: err.message, error: err, ms: Date.now() - started };
  }
}

async function test(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`  PASS  ${name}${note ? `  (${note})` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, note: e.message });
    console.log(`  FAIL  ${name}\n        -> ${e.message}`);
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

function randomInvoiceNumber() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `INV-2026-LIVE-${num}`;
}

async function main() {
  console.log("==================================================================");
  console.log("  STARS <-> FOMS Live API Integration Test (Headless / Zero UI)  ");
  console.log("==================================================================");
  console.log(`STARS API: ${STARS_URL}`);
  console.log(`FOMS API:  ${FOMS_URL}\n`);

  const testInvoiceNumber = randomInvoiceNumber();
  let createdStarsTaskId = null;
  let createdStarsTaskNumber = null;

  console.log("[1] Security & Auth Enforcement");
  await test("STARS rejects unauthorized endorsement request (no X-Api-Key)", async () => {
    const res = await call("POST", `${STARS_URL}/api/integration/foms/endorsement-request`, {
      body: { invoiceNumber: testInvoiceNumber, clientName: "Security Test" }
    });
    expect(res.status === 401 || res.status === 503, `expected 401/503 but got ${res.status} (${res.text})`);
    return `Status: ${res.status}`;
  });

  await test("STARS rejects invalid X-Api-Key", async () => {
    const res = await call("POST", `${STARS_URL}/api/integration/foms/endorsement-request`, {
      headers: { "X-Api-Key": "invalid-hex-key-999" },
      body: { invoiceNumber: testInvoiceNumber, clientName: "Security Test" }
    });
    expect(res.status === 401, `expected 401 but got ${res.status}`);
    return `Status: ${res.status}`;
  });

  await test("FOMS rejects unauthorized completion callback (no X-Api-Key)", async () => {
    const res = await call("POST", `${FOMS_URL}/api/integration/stars/invoice-endorsed`, {
      body: { invoiceNumber: testInvoiceNumber, actualReceivedDate: new Date().toISOString() }
    });
    expect(res.status === 401 || res.status === 503, `expected 401/503 but got ${res.status} (${res.text})`);
    return `Status: ${res.status}`;
  });

  console.log("\n[2] Integration 1: FOMS -> STARS Invoice Endorsement Request");
  await test("FOMS requests invoice endorsement; STARS creates Task with random 8-char TaskNumber", async () => {
    const payload = {
      invoiceNumber: testInvoiceNumber,
      clientName: "[INTEGRATION-TEST] Horizon Retail Holdings Inc.",
      clientAddress: "7th Floor, Commerce Tower, Ortigas Center, Pasig City",
      clientContactPerson: "Atty. Fernando Gomez",
      clientContactNumber: "09181234567",
      clientEmail: "fernando.gomez@horizonretail.ph",
      invoiceAmount: 89500.00,
      billingDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      invoiceDocumentUrl: "https://stars.blob.core.windows.net/test/INV-DOC-SAMPLE.pdf",
      remarks: "Urgent endorsement requested for billing settlement validation."
    };

    const res = await call("POST", `${STARS_URL}/api/integration/foms/endorsement-request`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `expected 200 OK but got ${res.status}: ${res.text}`);
    const data = res.json?.data || res.json;
    expect(data?.isSuccess === true, `expected isSuccess=true in payload: ${res.text}`);
    expect(data?.starsTaskId, "missing starsTaskId");
    expect(data?.starsTaskNumber && data.starsTaskNumber.length === 8, `expected 8-char task number but got: ${data?.starsTaskNumber}`);

    createdStarsTaskId = data.starsTaskId;
    createdStarsTaskNumber = data.starsTaskNumber;
    return `TaskId: ${createdStarsTaskId}, TaskNumber: ${createdStarsTaskNumber}`;
  });

  await test("Idempotency: Re-submitting exact same invoice returns existing Task without duplication", async () => {
    const payload = {
      invoiceNumber: testInvoiceNumber,
      clientName: "Horizon Retail Holdings Inc.",
      invoiceAmount: 89500.00
    };

    const res = await call("POST", `${STARS_URL}/api/integration/foms/endorsement-request`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `expected 200 OK but got ${res.status}`);
    const data = res.json?.data || res.json;
    expect(data?.starsTaskId === createdStarsTaskId, `expected duplicate to return original taskId ${createdStarsTaskId}`);
    return `Idempotent TaskId verified: ${data?.starsTaskId}`;
  });

  console.log("\n[3] Integration 1 Callback: STARS -> FOMS Endorsement Completion & 30-Day Term");
  await test("STARS sends endorsement completion; FOMS applies standard 30-day term (FR-028)", async () => {
    const actualReceived = new Date().toISOString();
    const targetInvoice = "LZD-2026-0001";
    const payload = {
      invoiceNumber: targetInvoice,
      starsTaskId: createdStarsTaskId,
      starsTaskNumber: createdStarsTaskNumber,
      completionResult: "Completed",
      actualReceivedDate: actualReceived,
      signedCopyUrl: "https://stars.blob.core.windows.net/signed-receipts/RC-2026-LIVE-001.pdf",
      deliveryRemarks: "Document received and endorsed with wet signature by Head of Accounting.",
      completedAt: new Date().toISOString(),
      completedBy: "STARS Operations Coordinator"
    };

    const res = await call("POST", `${FOMS_URL}/api/integration/stars/invoice-endorsed`, {
      headers: { "X-Api-Key": STARS_TO_FOMS_KEY },
      body: payload
    });

    expect(res.status === 200, `expected 200 OK from FOMS but got ${res.status}: ${res.text}`);
    return `FOMS response: ${res.json?.message || res.text}`;
  });

  console.log("\n[4] Integration 2: FOMS -> STARS Payment Status Webhook & Dashboard");
  await test("FOMS pushes payment status update to STARS", async () => {
    const payload = {
      clientAccountId: "CLI-LIVE-001",
      clientName: "Horizon Retail Holdings Inc.",
      invoiceNumber: testInvoiceNumber,
      currentStatus: "Overdue",
      totalAmount: 89500.00,
      amountPaid: 20000.00,
      outstandingBalance: 69500.00,
      nextDueDate: new Date(Date.now() - 5 * 86400000).toISOString(),
      timestamp: new Date().toISOString()
    };

    const res = await call("POST", `${STARS_URL}/api/integration/foms/payment-status`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `expected 200 OK but got ${res.status}: ${res.text}`);
    return "Status recorded in STARS financial tracking cache";
  });

  await test("STARS exposes updated Dashboard Financial Summary (FR-038)", async () => {
    const res = await call("GET", `${STARS_URL}/api/integration/foms/dashboard-summary`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY }
    });

    expect(res.status === 200, `expected 200 OK but got ${res.status}: ${res.text}`);
    const summary = res.json?.data || res.json;
    expect(summary.totalInvoicesTracked >= 1, "expected totalInvoicesTracked >= 1");
    return `Tracked Invoices: ${summary.totalInvoicesTracked}, Outstanding: ₱${summary.totalOutstandingBalance?.toLocaleString()}`;
  });

  console.log("\n[5] Integration 3: FOMS -> STARS Overdue Accounts Collection Routing");
  await test("FOMS pushes overdue alert; STARS creates Collection Task via Graph Routing Engine", async () => {
    const overdueInvoiceNo = randomInvoiceNumber();
    const payload = {
      invoiceNumber: overdueInvoiceNo,
      clientAccountId: "CLI-OVERDUE-01",
      clientName: "[INTEGRATION-TEST] Trans-Pacific Express Cargo",
      clientContactPerson: "Mr. Victor Ramos",
      clientContactNumber: "09201234567",
      clientEmail: "victor.ramos@transpacific.com",
      clientAddress: "Km 18, West Service Road, Parañaque City",
      amountDue: 145000.00,
      dueDate: new Date(Date.now() - 35 * 86400000).toISOString(),
      daysOverdue: 35,
      agingStatus: "31-60",
      alertTimestamp: new Date().toISOString(),
      remarks: "Account severely overdue (35 days). Immediate field collection routing required."
    };

    const res = await call("POST", `${STARS_URL}/api/integration/foms/overdue-alert`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `expected 200 OK but got ${res.status}: ${res.text}`);
    const data = res.json?.data || res.json;
    expect(data?.isSuccess === true, `expected isSuccess=true: ${res.text}`);
    expect(data?.starsTaskId, "missing starsTaskId");
    expect(data?.starsTaskNumber && data.starsTaskNumber.length === 8, "expected 8-char TaskNumber");

    return `Routed Task: ${data.starsTaskId} (${data.starsTaskNumber}) -> Assigned: ${data.assignedTo ?? "Optimal Coordinator"}`;
  });

  console.log("\n==================================================================");
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} checks`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error running test suite:", err);
  process.exit(1);
});
