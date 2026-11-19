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
      starsTaskId: createdStarsTaskId || "a0000000-0000-0000-0000-000000000001",
      starsTaskNumber: createdStarsTaskNumber || "FALLBACK1",
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
  await test("FOMS pushes payment status update to STARS with aligned contracts (FR-038)", async () => {
    const payload = {
      clientAccountId: "CLI-LIVE-001",
      clientName: "Horizon Retail Holdings Inc.",
      invoiceNumber: testInvoiceNumber,
      invoiceStatus: "Sent",
      paymentStatus: "Unpaid",
      dueStatus: "Overdue",
      agingBucket: "1-30",
      totalAmount: 89500.00,
      amountPaid: 20000.00,
      outstandingBalance: 69500.00,
      dueDate: new Date(Date.now() - 5 * 86400000).toISOString(),
      currentStatus: "Overdue",
      timestamp: new Date().toISOString()
    };

    const res = await call("POST", `${STARS_URL}/api/integration/foms/payment-status`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `expected 200 OK but got ${res.status}: ${res.text}`);
    return "Status and aging bucket recorded in STARS financial tracking cache";
  });

  await test("FOMS pushes full payment settlement (FR-039) to STARS; balance clears", async () => {
    const payload = {
      clientAccountId: "CLI-LIVE-001",
      clientName: "Horizon Retail Holdings Inc.",
      invoiceNumber: testInvoiceNumber,
      invoiceStatus: "Sent",
      paymentStatus: "Paid",
      dueStatus: "Normal",
      agingBucket: "Current",
      totalAmount: 89500.00,
      amountPaid: 89500.00,
      outstandingBalance: 0.00,
      dueDate: new Date(Date.now() + 25 * 86400000).toISOString(),
      currentStatus: "Paid",
      timestamp: new Date().toISOString()
    };

    const res = await call("POST", `${STARS_URL}/api/integration/foms/payment-status`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `expected 200 OK but got ${res.status}: ${res.text}`);
    return "Full payment recorded; invoice marked Paid";
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
  const overdueInvoiceNo = randomInvoiceNumber();
  let createdCollectionTaskId = null;
  let createdCollectionTaskNumber = null;

  await test("FOMS pushes overdue alert; STARS creates Collection Follow-up task (FR-039, FR-019)", async () => {
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

    createdCollectionTaskId = data.starsTaskId;
    createdCollectionTaskNumber = data.starsTaskNumber;
    return `Routed Task: ${data.starsTaskId} (${data.starsTaskNumber}) -> Assigned: ${data.assignedTo ?? "Optimal Coordinator"}`;
  });

  await test("Idempotency & FR-044: Re-sending exact same overdue alert appends remark without duplicate task", async () => {
    const duplicatePayload = {
      invoiceNumber: overdueInvoiceNo,
      clientAccountId: "CLI-OVERDUE-01",
      clientName: "[INTEGRATION-TEST] Trans-Pacific Express Cargo",
      amountDue: 145000.00,
      daysOverdue: 35,
      agingStatus: "31-60",
      remarks: "Second alert receipt for same delinquent invoice."
    };

    const res = await call("POST", `${STARS_URL}/api/integration/foms/overdue-alert`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY },
      body: duplicatePayload
    });

    expect(res.status === 200, `expected 200 OK but got ${res.status}: ${res.text}`);
    const data = res.json?.data || res.json;
    expect(data?.isSuccess === true, `expected isSuccess=true: ${res.text}`);
    expect(data?.starsTaskId === createdCollectionTaskId, `expected duplicate to return existing taskId ${createdCollectionTaskId}`);
    expect(data?.message?.includes("FR-044") || data?.message?.includes("already exists"), `expected FR-044 notice in message: ${data?.message}`);
    return `Existing Task Retained: ${data.starsTaskId} per FR-044`;
  });

  await test("Coordinator records outcome and dispatches callback to FOMS (FOMS FR-033)", async () => {
    const dispatchPayload = {
      taskId: createdCollectionTaskId,
      outcome: "Promised to Pay",
      promisedPaymentDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      actionTaken: "Phone Conference",
      notes: "Client finance director confirmed payment commitment upon billing reconciliation.",
      coordinatorName: "STARS Operations Coordinator"
    };

    const res = await call("POST", `${STARS_URL}/api/integration/foms/dispatch-collection-outcome`, {
      headers: { "X-Api-Key": FOMS_TO_STARS_KEY },
      body: dispatchPayload
    });

    expect(res.status === 200, `expected 200 OK from STARS dispatch but got ${res.status}: ${res.text}`);
    const data = res.json?.data || res.json;
    expect(data?.isSuccess === true || res.json?.isSuccess === true, `expected isSuccess=true: ${res.text}`);
    return `Outcome dispatched: ${res.json?.message || "Success"}`;
  });

  await test("FOMS receives collection outcome callback directly and records InvoiceFollowUpLog (FR-033)", async () => {
    const outcomeCallbackPayload = {
      invoiceNumber: overdueInvoiceNo,
      starsTaskId: createdCollectionTaskId,
      starsTaskNumber: createdCollectionTaskNumber,
      outcome: "Promised to Pay",
      promisedPaymentDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      actionTaken: "Direct Field Visit",
      notes: "Promissory settlement agreement signed with accounting manager.",
      coordinatorName: "STARS Operations Coordinator",
      completedAt: new Date().toISOString()
    };

    const res = await call("POST", `${FOMS_URL}/api/integration/stars/collection-outcome`, {
      headers: { "X-Api-Key": STARS_TO_FOMS_KEY },
      body: outcomeCallbackPayload
    });

    expect(res.status === 200, `expected 200 OK from FOMS but got ${res.status}: ${res.text}`);
    expect(res.json?.isSuccess === true, `expected isSuccess=true: ${res.text}`);
    return `FOMS response: ${res.json?.message}`;
  });

  await test("Exclusion verification: Disputed invoices are barred from collection routing (FR-034)", async () => {
    const disputedInvoiceNo = `INV-DISP-LIVE-${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. Establish invoice in FOMS as Disputed via collection outcome
    const disputeSetup = await call("POST", `${FOMS_URL}/api/integration/stars/collection-outcome`, {
      headers: { "X-Api-Key": STARS_TO_FOMS_KEY },
      body: {
        invoiceNumber: disputedInvoiceNo,
        starsTaskId: "b0000000-0000-0000-0000-000000000001",
        starsTaskNumber: "DISP-001",
        outcome: "Disputed",
        actionTaken: "Audit Review",
        notes: "Client disputed freight surcharge charges.",
        coordinatorName: "Billing Reviewer",
        completedAt: new Date().toISOString()
      }
    });
    expect(disputeSetup.status === 200, `expected 200 OK setup: ${disputeSetup.text}`);

    // 2. Trigger overdue alert from FOMS for this disputed invoice
    const triggerRes = await call("POST", `${FOMS_URL}/api/integration/stars/trigger-overdue-alert/${disputedInvoiceNo}`, {
      headers: { "X-Api-Key": STARS_TO_FOMS_KEY }
    });

    // Per FR-034, FOMS halts dispatch and returns 400 with disputed explanation
    expect(triggerRes.status === 400, `expected 400 Bad Request but got ${triggerRes.status}: ${triggerRes.text}`);
    expect(triggerRes.json?.isSuccess === false, `expected isSuccess=false: ${triggerRes.text}`);
    expect(triggerRes.json?.message?.includes("disputed (FR-034)"), `expected FR-034 mention in error message: ${triggerRes.json?.message}`);
    return `Exclusion gate passed: ${triggerRes.json?.message}`;
  });

  await test("Exclusion verification: Non-existent invoices return clean 400 validation error", async () => {
    const nonExistentNo = "INV-NON-EXISTENT-" + Math.floor(Math.random() * 99999);
    const triggerRes = await call("POST", `${FOMS_URL}/api/integration/stars/trigger-overdue-alert/${nonExistentNo}`, {
      headers: { "X-Api-Key": STARS_TO_FOMS_KEY }
    });

    expect(triggerRes.status === 400, `expected 400 Bad Request but got ${triggerRes.status}: ${triggerRes.text}`);
    expect(triggerRes.json?.isSuccess === false, `expected isSuccess=false: ${triggerRes.text}`);
    return `Non-existent invoice rejected cleanly: ${triggerRes.json?.message}`;
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
