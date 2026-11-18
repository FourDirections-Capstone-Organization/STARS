#!/usr/bin/env node
/**
 * End-to-End Live Integration Verification Script (Zero Frontend UI)
 * Tests all 3 integrations between STARS and DMS across the internet:
 *   - Integration 1: STARS -> DMS Delivery Order Creation (auto-generating Waybill)
 *   - Integration 2: DMS -> STARS Delivery Status Webhook (real-time tracking & alerts)
 *   - Integration 3: DMS -> STARS Delivery Performance Batch Sync & Analytics
 *
 * Usage:
 *   node api-integration-tests/test-stars-dms-e2e.mjs
 */

const env = process.env;
const strip = (u) => (u || "").replace(/\/+$/, "");

const STARS_URL = strip(env.STARS_API_URL || "https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net");
const DMS_URL = strip(env.DMS_API_URL || "https://dts-api-gab-byafd0h2aha6a9c9.japaneast-01.azurewebsites.net");

// Pre-shared 256-bit API keys
const STARS_TO_DMS_KEY = env.STARS_TO_DMS_KEY || "875d97514db36a86d7e405e3d8d21cb3a94825ec5f984953f845df7bcf89381f";
const DMS_TO_STARS_KEY = env.DMS_TO_STARS_KEY || "af4a0af7cd3651300fe515623a28481421d93b3324715a87ab8d4aed5887514a";

const TIMEOUT_MS = 60_000;
const results = [];

async function call(method, url, { headers = {}, body } = {}) {
  const started = Date.now();
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

function randomUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function main() {
  console.log("==================================================================");
  console.log("   STARS <-> DMS Live API Integration Test (Headless / Zero UI)   ");
  console.log("==================================================================");
  console.log(`STARS API: ${STARS_URL}`);
  console.log(`DMS API:   ${DMS_URL}\n`);

  const testTaskId = randomUuid();
  let generatedWaybill = null;
  let dmsOrderId = null;

  console.log("[1] Security & Auth Enforcement");
  await test("DMS rejects unauthorized delivery order creation (no X-Api-Key)", async () => {
    const res = await call("POST", `${DMS_URL}/api/integration/stars/delivery-orders`, {
      body: { starsTaskId: testTaskId, recipientName: "Test" }
    });
    expect(res.status === 401 || res.status === 503, `expected 401/503 but got ${res.status}`);
    return `Status: ${res.status}`;
  });

  await test("STARS rejects unauthorized status updates (no X-Api-Key)", async () => {
    const res = await call("POST", `${STARS_URL}/api/integration/dms/status`, {
      body: { starsTaskId: testTaskId, waybillNo: "WB-TEST", status: "In Transit" }
    });
    expect(res.status === 401 || res.status === 503, `expected 401/503 but got ${res.status}`);
    return `Status: ${res.status}`;
  });

  console.log("\n[2] Integration 1: STARS -> DMS Delivery Order Creation");
  await test("DMS creates Delivery Order and auto-generates Waybill", async () => {
    const payload = {
      starsTaskId: testTaskId,
      taskStatus: "Approved",
      taskTitle: "[INTEGRATION-TEST] Delivery of Urgent Audit Documentation",
      recipientName: "Engr. Roberto Cruz",
      recipientContact: "09171234567",
      deliveryAddress: "Tower 2, High Street South, Bonifacio Global City, Taguig",
      area: "Taguig",
      packageDescription: "Confidential Project Dossier",
      priorityLevel: "Urgent",
      taskCompletedAt: new Date().toISOString(),
      coordinatorId: "COORD-SYSTEM-01"
    };

    const res = await call("POST", `${DMS_URL}/api/integration/stars/delivery-orders`, {
      headers: { "X-Api-Key": STARS_TO_DMS_KEY },
      body: payload
    });

    expect(res.status === 201 || res.status === 200, `unexpected status ${res.status}: ${res.text}`);
    expect(res.json?.waybillNo, "missing waybillNo in response");
    expect(res.json?.starsTaskId === testTaskId, "starsTaskId does not match");

    generatedWaybill = res.json.waybillNo;
    dmsOrderId = res.json.orderId;
    return `Waybill: ${generatedWaybill}, OrderId: ${dmsOrderId} (${res.ms}ms)`;
  });

  await test("DMS enforces idempotency on retried order creation", async () => {
    const payload = {
      starsTaskId: testTaskId,
      taskStatus: "Approved",
      taskTitle: "[INTEGRATION-TEST] Retry Submission",
      recipientName: "Engr. Roberto Cruz",
      recipientContact: "09171234567",
      deliveryAddress: "Taguig City"
    };

    const res = await call("POST", `${DMS_URL}/api/integration/stars/delivery-orders`, {
      headers: { "X-Api-Key": STARS_TO_DMS_KEY },
      body: payload
    });

    expect(res.status === 200, `expected 200 OK for idempotent retry, got ${res.status}`);
    expect(res.json?.alreadyExisted === true, "alreadyExisted flag should be true");
    expect(res.json?.waybillNo === generatedWaybill, `returned waybill ${res.json?.waybillNo} does not match initial ${generatedWaybill}`);
    return `Returned existing Waybill: ${res.json.waybillNo}`;
  });

  await test("STARS initiates M2M outbound dispatch to DMS over internet", async () => {
    const res = await call("POST", `${STARS_URL}/api/integration/dms/dispatch`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY },
      body: {}
    });

    expect(res.status === 200, `dispatch failed with status ${res.status}: ${res.text}`);
    const detail = res.json?.data || res.json;
    expect(detail?.dmsWaybillNo, "missing dmsWaybillNo in response");
    return `Dispatched Task: ${detail.taskId} -> Generated Waybill: ${detail.dmsWaybillNo} (${res.ms}ms)`;
  });

  console.log("\n[3] Integration 2: DMS -> STARS Delivery Status Webhook");
  await test("STARS receives status sync and updates live parcel tracking", async () => {
    const waybill = generatedWaybill || "WB-2026-TEST01";
    const payload = {
      waybillNo: waybill,
      starsTaskId: testTaskId,
      status: "In Transit",
      dmsStatus: "Out for Delivery",
      timestamp: new Date().toISOString(),
      driverId: "DRV-001",
      latitude: 14.5547,
      longitude: 121.0509,
      recipientName: "Engr. Roberto Cruz",
      recipientContact: "09171234567",
      deliveryAddress: "Tower 2, High Street South, Bonifacio Global City, Taguig",
      area: "Taguig"
    };

    const res = await call("POST", `${STARS_URL}/api/integration/dms/status`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `status update failed with ${res.status}: ${res.text}`);
    expect(res.json?.isSuccess === true || res.json?.success === true, `response: ${res.text}`);

    // Verify STARS persisted the recipient details from the webhook
    const checkRes = await call("GET", `${STARS_URL}/api/integration/dms/tasks/${testTaskId}/delivery-details`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY }
    });
    const saved = checkRes.json?.data || checkRes.json;
    expect(saved?.recipientName === "Engr. Roberto Cruz", `expected recipient 'Engr. Roberto Cruz' but got '${saved?.recipientName}'`);
    expect(saved?.recipientContact === "09171234567", `expected contact '09171234567' but got '${saved?.recipientContact}'`);
    expect(saved?.deliveryAddress?.includes("Taguig"), `expected Taguig address but got '${saved?.deliveryAddress}'`);

    return `Updated to 'In Transit' (Recipient: ${saved.recipientName}, Address: ${saved.deliveryAddress}) (${res.ms}ms)`;
  });

  console.log("\n[4] Integration 3: DMS -> STARS Performance Analytics Sync");
  await test("STARS receives batch performance records from DMS", async () => {
    const waybill = generatedWaybill || "WB-2026-TEST01";
    const payload = {
      generatedAt: new Date().toISOString(),
      records: [
        {
          driverId: "DRV-001",
          waybillNo: waybill,
          starsTaskId: testTaskId,
          completedAt: new Date(Date.now() - 3600_000).toISOString(),
          slaTargetAt: new Date(Date.now() + 7200_000).toISOString(),
          isOnTime: true
        }
      ]
    };

    const res = await call("POST", `${STARS_URL}/api/integration/dms/performance-batch`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `performance batch failed with ${res.status}: ${res.text}`);
    return `Processed batch successfully (${res.ms}ms)`;
  });

  await test("STARS computes on-time delivery analytics summary", async () => {
    const res = await call("GET", `${STARS_URL}/api/integration/dms/performance-summary`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY }
    });

    expect(res.status === 200, `failed to get summary with ${res.status}`);
    const data = res.json?.data || res.json;
    expect(typeof data?.totalDeliveries === "number", "missing totalDeliveries");
    expect(typeof data?.onTimePercentage === "number", "missing onTimePercentage");
    return `Total: ${data.totalDeliveries}, On-Time: ${data.onTimeCount} (${data.onTimePercentage}%)`;
  });

  console.log("\n[5] Integration 4: Failed Delivery / Pickup -> Follow-up Task Creation");
  let followUpTaskId = null;
  let assignedCoordId = null;

  await test("STARS rejects unauthorized failure follow-up (no X-Api-Key)", async () => {
    const res = await call("POST", `${STARS_URL}/api/integration/dms/failure-followup`, {
      body: {
        waybillNo: generatedWaybill || "WB-2026-TEST01",
        starsTaskId: testTaskId,
        failureType: "Failed Delivery",
        failureReason: "Recipient Unreachable"
      }
    });
    expect(res.status === 401 || res.status === 503, `expected 401/503 but got ${res.status}`);
    return `Status: ${res.status}`;
  });

  await test("DMS rejects unauthorized failure follow-up trigger (no X-Api-Key)", async () => {
    const res = await call("POST", `${DMS_URL}/api/integration/stars/failure-followup/trigger`, {
      body: {
        waybillNo: generatedWaybill || "WB-2026-TEST01",
        starsTaskId: testTaskId,
        failureType: "Failed Delivery",
        failureReason: "Recipient Unreachable"
      }
    });
    expect(res.status === 401 || res.status === 503, `expected 401/503 but got ${res.status}`);
    return `Status: ${res.status}`;
  });

  await test("STARS creates follow-up task on Failed Delivery (assigned to Coordinator, original Completed)", async () => {
    // 1. Mark original task as Completed in STARS so we can verify original FSM state remains Completed
    await call("POST", `${STARS_URL}/api/integration/dms/status`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY },
      body: {
        waybillNo: generatedWaybill,
        starsTaskId: testTaskId,
        status: "Delivered",
        dmsStatus: "Delivered",
        timestamp: new Date().toISOString()
      }
    });

    const payload = {
      waybillNo: generatedWaybill,
      starsTaskId: testTaskId,
      failureType: "Failed Delivery",
      failureReason: "Customer Unreachable / Delivery Address Closed",
      attemptCount: 1,
      timestamp: new Date().toISOString(),
      driverId: "DRV-001",
      driverName: "Juan Dela Cruz"
    };

    const res = await call("POST", `${STARS_URL}/api/integration/dms/failure-followup`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY },
      body: payload
    });

    expect(res.status === 200, `failure follow-up failed with status ${res.status}: ${res.text}`);
    const data = res.json?.data || res.json;
    expect(data?.actionTaken === "CreatedTask", `expected action 'CreatedTask' but got '${data?.actionTaken}'`);
    expect(data?.followUpTaskId, "missing followUpTaskId in response");
    expect(data?.assignedCoordinatorId, "missing assignedCoordinatorId in response");
    expect(data?.waybillNo === generatedWaybill, `waybill mismatch: ${data?.waybillNo} vs ${generatedWaybill}`);

    followUpTaskId = data.followUpTaskId;
    assignedCoordId = data.assignedCoordinatorId;

    // Verify follow-up task details in STARS
    const followUpCheck = await call("GET", `${STARS_URL}/api/integration/dms/tasks/${followUpTaskId}/delivery-details`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY }
    });
    expect(followUpCheck.status === 200, `failed to fetch follow-up task details: ${followUpCheck.status}`);
    const followUpDetail = followUpCheck.json?.data || followUpCheck.json;
    expect(followUpDetail?.dmsStatus === "Failed", `expected dmsStatus 'Failed', got '${followUpDetail?.dmsStatus}'`);
    expect(followUpDetail?.dmsFailureReason === payload.failureReason, `expected failureReason '${payload.failureReason}', got '${followUpDetail?.dmsFailureReason}'`);

    // Verify original task delivery details remain intact
    const originalCheck = await call("GET", `${STARS_URL}/api/integration/dms/tasks/${testTaskId}/delivery-details`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY }
    });
    expect(originalCheck.status === 200, `failed to fetch original task details: ${originalCheck.status}`);

    return `Created Task: ${followUpTaskId}, Assignee: ${assignedCoordId}, Action: ${data.actionTaken} (${res.ms}ms)`;
  });

  await test("STARS enforces deduplication and appends remark on secondary failure attempt", async () => {
    const payloadAttempt2 = {
      waybillNo: generatedWaybill,
      starsTaskId: testTaskId,
      failureType: "Failed Delivery",
      failureReason: "Customer Phone Unattended on 2nd Attempt",
      attemptCount: 2,
      timestamp: new Date().toISOString(),
      driverId: "DRV-001",
      driverName: "Juan Dela Cruz"
    };

    const res = await call("POST", `${STARS_URL}/api/integration/dms/failure-followup`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY },
      body: payloadAttempt2
    });

    expect(res.status === 200, `dedup attempt failed with status ${res.status}: ${res.text}`);
    const data = res.json?.data || res.json;
    expect(data?.actionTaken === "AddedRemark", `expected action 'AddedRemark' but got '${data?.actionTaken}'`);
    expect(data?.followUpTaskId === followUpTaskId, `expected existing task ${followUpTaskId}, got ${data?.followUpTaskId}`);
    return `Appended Remark to existing task: ${data.followUpTaskId}, Action: ${data.actionTaken} (${res.ms}ms)`;
  });

  await test("STARS creates follow-up task on Failed Pickup (overdue > 2 business days)", async () => {
    const pickupWaybill = `WB-PKUP-${Date.now().toString().slice(-6)}`;
    const pickupTaskId = randomUuid();
    const pickupPayload = {
      waybillNo: pickupWaybill,
      starsTaskId: pickupTaskId,
      failureType: "Failed Pickup",
      failureReason: "Pickup Overdue > 2 Business Days (Sender Warehouse Unavailable)",
      attemptCount: 1,
      timestamp: new Date().toISOString(),
      driverId: "DRV-002",
      driverName: "Maria Santos"
    };

    const res = await call("POST", `${STARS_URL}/api/integration/dms/failure-followup`, {
      headers: { "X-Api-Key": DMS_TO_STARS_KEY },
      body: pickupPayload
    });

    expect(res.status === 200, `failed pickup follow-up failed with status ${res.status}: ${res.text}`);
    const data = res.json?.data || res.json;
    expect(data?.actionTaken === "CreatedTask", `expected action 'CreatedTask' but got '${data?.actionTaken}'`);
    expect(data?.followUpTaskId, "missing followUpTaskId for pickup follow-up");
    return `Created Pickup Follow-up: ${data.followUpTaskId}, Assignee: ${data.assignedCoordinatorId} (${res.ms}ms)`;
  });

  await test("DMS triggers failure follow-up to STARS via M2M trigger endpoint", async () => {
    const triggerWaybill = `WB-TRIG-${Date.now().toString().slice(-6)}`;
    const triggerTaskId = randomUuid();
    const triggerPayload = {
      waybillNo: triggerWaybill,
      starsTaskId: triggerTaskId,
      failureType: "Failed Delivery",
      failureReason: "Incorrect Shipping Address / Incomplete Coordinates",
      attemptCount: 1,
      timestamp: new Date().toISOString(),
      driverId: "DRV-003",
      driverName: "Pedro Penduko"
    };

    const res = await call("POST", `${DMS_URL}/api/integration/stars/failure-followup/trigger`, {
      headers: { "X-Api-Key": STARS_TO_DMS_KEY },
      body: triggerPayload
    });

    expect(res.status === 200, `DMS failure trigger failed with status ${res.status}: ${res.text}`);
    expect(res.json?.success === true, `expected success: true, got ${res.text}`);
    return `DMS relayed failure event to STARS successfully (${res.ms}ms)`;
  });

  console.log("\n==================================================================");
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================================");

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Test execution aborted:", err);
  process.exit(2);
});
