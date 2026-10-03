#!/usr/bin/env node
/**
 * STARS <-> Delivery System (DMS) backend API integration tests.
 *
 * Standalone: zero dependencies (Node 18+), not part of either app's build,
 * touches no existing backend/frontend code. Safe to run against production:
 * only GET / OPTIONS / failed-login POSTs are sent, and nothing is written.
 *
 * Usage:   node integration.mjs
 * Config (all optional, via environment variables):
 *   STARS_API_URL        default https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net
 *   DMS_API_URL          default https://dts-api-gab-byafd0h2aha6a9c9.japaneast-01.azurewebsites.net
 *   STARS_FRONTEND_ORIGIN default https://stars-two-chi.vercel.app
 *   DMS_FRONTEND_ORIGIN   Vercel URL of the DMS frontend (enables CORS tests for it)
 *   STARS_IDENTIFIER / STARS_PASSWORD      real STARS account  (enables authenticated tests)
 *   DMS_EMPLOYEE_ID / DMS_PASSWORD         real DMS account    (enables authenticated tests)
 *   DMS_WAYBILL          an existing waybill number (enables the "found" tracking test)
 */

const strip = (u) => u.replace(/\/+$/, "");
const env = process.env;
const STARS = strip(env.STARS_API_URL || "https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net");
const DMS = strip(env.DMS_API_URL || "https://dts-api-gab-byafd0h2aha6a9c9.japaneast-01.azurewebsites.net");
const STARS_ORIGIN = env.STARS_FRONTEND_ORIGIN || "https://stars-two-chi.vercel.app";
const DMS_ORIGIN = env.DMS_FRONTEND_ORIGIN || "";
const TIMEOUT_MS = 60_000; // Azure cold starts can be slow

const results = [];

async function call(method, url, { headers = {}, body } = {}) {
  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "manual",
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
function skip(name, why) {
  results.push({ name, ok: null, note: why });
  console.log(`  SKIP  ${name}  (${why})`);
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

function findToken(o) {
  if (!o || typeof o !== "object") return null;
  for (const k of ["accessToken", "token", "access_token", "jwt"]) {
    if (typeof o[k] === "string") return o[k];
  }
  for (const v of Object.values(o)) {
    const t = findToken(v);
    if (t) return t;
  }
  return null;
}

/** Simulates the browser CORS preflight a frontend on `origin` sends to `apiUrl`. */
async function corsPreflight(apiUrl, path, origin) {
  const r = await call("OPTIONS", apiUrl + path, {
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  const allowed = r.headers.get("access-control-allow-origin");
  expect(allowed === origin, `origin ${origin} NOT allowed (status ${r.status}, ACAO=${allowed ?? "none"})`);
  return `ACAO=${allowed}, ${r.ms}ms`;
}

async function main() {
  console.log("STARS <-> DMS API integration tests");
  console.log(`  STARS API: ${STARS}\n  DMS API:   ${DMS}\n`);

  console.log("[1] Reachability (public endpoints)");
  await test("STARS GET /api/health is healthy + DB connected", async () => {
    const r = await call("GET", `${STARS}/api/health`);
    expect(r.status === 200, `status ${r.status}`);
    expect(r.json?.status === "healthy", `status field = ${r.json?.status}`);
    return `${r.ms}ms`;
  });
  await test("STARS GET / identifies itself", async () => {
    const r = await call("GET", `${STARS}/`);
    expect(r.status === 200 && r.json?.service === "STARS Backend API", `unexpected: ${r.status} ${r.text.slice(0, 80)}`);
    return `${r.ms}ms`;
  });
  await test("DMS API is reachable (anonymous /api/auth/profile -> 401, not 5xx/404)", async () => {
    const r = await call("GET", `${DMS}/api/auth/profile`);
    expect(r.status === 401, `status ${r.status} (expected 401)`);
    return `${r.ms}ms`;
  });
  await test("DMS public tracking: unknown waybill -> 404 JSON (proves DB reachable)", async () => {
    const r = await call("GET", `${DMS}/api/delivery-orders/track?waybill=INTEGRATION-TEST-NOPE`);
    expect(r.status === 404, `status ${r.status} (expected 404)`);
    return `${r.ms}ms`;
  });
  if (env.DMS_WAYBILL) {
    await test("DMS public tracking: known waybill returns data", async () => {
      const r = await call("GET", `${DMS}/api/delivery-orders/track?waybill=${encodeURIComponent(env.DMS_WAYBILL)}`);
      expect(r.status === 200, `status ${r.status}`);
      return `${r.ms}ms`;
    });
  } else skip("DMS public tracking: known waybill", "set DMS_WAYBILL");

  console.log("\n[2] Auth enforced on protected endpoints (no token -> 401)");
  await test("STARS GET /api/task without token -> 401", async () => {
    const r = await call("GET", `${STARS}/api/task`);
    expect(r.status === 401, `status ${r.status}`);
  });
  await test("DMS GET /api/delivery-orders without token -> 401", async () => {
    const r = await call("GET", `${DMS}/api/delivery-orders`);
    expect(r.status === 401, `status ${r.status}`);
  });
  await test("Tokens are NOT interchangeable (forged/foreign JWT rejected by both)", async () => {
    // Structurally valid JWT signed with a throwaway key: both must refuse it.
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const fake = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "x", role: "ADMIN" })}.invalidsignature`;
    const h = { Authorization: `Bearer ${fake}` };
    const a = await call("GET", `${STARS}/api/task`, { headers: h });
    const b = await call("GET", `${DMS}/api/delivery-orders`, { headers: h });
    expect(a.status === 401 && b.status === 401, `STARS ${a.status}, DMS ${b.status} (both must be 401)`);
  });

  console.log("\n[3] Login endpoints accept the request shape and reject bad credentials");
  await test("STARS POST /api/auth/login with bad creds -> handled (no 5xx)", async () => {
    const r = await call("POST", `${STARS}/api/auth/login`, { body: { identifier: "integration.test.nouser", password: "wrong-password" } });
    expect(r.status < 500, `status ${r.status}`);
    expect(!findToken(r.json), "a token was issued for bad credentials!");
    return `status ${r.status}`;
  });
  await test("DMS POST /api/auth/login with bad creds -> 401", async () => {
    const r = await call("POST", `${DMS}/api/auth/login`, { body: { employeeId: "INTEGRATION-TEST", password: "wrong-password" } });
    expect(r.status === 401, `status ${r.status} (expected 401)`);
    expect(!findToken(r.json), "a token was issued for bad credentials!");
  });

  console.log("\n[4] CORS - can each system's Vercel frontend call the other's API from a browser?");
  await test("STARS API allows STARS frontend origin", () => corsPreflight(STARS, "/api/health", STARS_ORIGIN));
  if (DMS_ORIGIN) {
    await test("STARS API allows DMS frontend origin (DMS Vercel -> STARS)", () => corsPreflight(STARS, "/api/health", DMS_ORIGIN));
    await test("DMS API allows DMS frontend origin", () => corsPreflight(DMS, "/api/auth/login", DMS_ORIGIN));
  } else skip("DMS frontend origin CORS tests", "set DMS_FRONTEND_ORIGIN");
  await test("DMS API allows STARS frontend origin (STARS Vercel -> DMS)", () => corsPreflight(DMS, "/api/auth/login", STARS_ORIGIN));

  console.log("\n[5] Authenticated read-only calls (optional)");
  let starsToken = null, dmsToken = null;
  if (env.STARS_IDENTIFIER && env.STARS_PASSWORD) {
    await test("STARS login with real account returns a JWT", async () => {
      const r = await call("POST", `${STARS}/api/auth/login`, { body: { identifier: env.STARS_IDENTIFIER, password: env.STARS_PASSWORD } });
      starsToken = findToken(r.json);
      expect(starsToken, `no token in response (status ${r.status})`);
    });
    if (starsToken) await test("STARS GET /api/task with JWT -> 200", async () => {
      const r = await call("GET", `${STARS}/api/task?pageNumber=1&pageSize=1`, { headers: { Authorization: `Bearer ${starsToken}` } });
      expect(r.status === 200, `status ${r.status}`);
    });
  } else skip("STARS authenticated tests", "set STARS_IDENTIFIER and STARS_PASSWORD");
  if (env.DMS_EMPLOYEE_ID && env.DMS_PASSWORD) {
    await test("DMS login with real account returns a JWT", async () => {
      const r = await call("POST", `${DMS}/api/auth/login`, { body: { employeeId: env.DMS_EMPLOYEE_ID, password: env.DMS_PASSWORD } });
      dmsToken = findToken(r.json);
      expect(dmsToken, `no token in response (status ${r.status})`);
    });
    if (dmsToken) await test("DMS GET /api/delivery-orders with JWT -> 200", async () => {
      const r = await call("GET", `${DMS}/api/delivery-orders`, { headers: { Authorization: `Bearer ${dmsToken}` } });
      expect(r.status === 200, `status ${r.status}`);
    });
  } else skip("DMS authenticated tests", "set DMS_EMPLOYEE_ID and DMS_PASSWORD");

  const pass = results.filter((r) => r.ok === true).length;
  const fail = results.filter((r) => r.ok === false).length;
  const skipped = results.filter((r) => r.ok === null).length;
  console.log(`\nSummary: ${pass} passed, ${fail} failed, ${skipped} skipped`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
