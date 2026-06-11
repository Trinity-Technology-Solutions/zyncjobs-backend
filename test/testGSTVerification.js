/**
 * GST Verification Tests — Surepass API
 * Run: node test/testGSTVerification.js
 *      npm run test:gst
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api`;
const SUREPASS_TOKEN = process.env.SUREPASS_TOKEN;
const VALID_GST    = '33AAMCG2020K2ZT';
const SUREPASS_URL = 'https://sandbox.surepass.io/api/v1/corporate/gstin';

let passed = 0;
let failed = 0;
let skipped = 0;

function log(label, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${label}${detail ? '  →  ' + detail : ''}`);
  ok ? passed++ : failed++;
}

function skip(label, reason) {
  console.log(`  ⏭️  ${label}  →  SKIPPED (${reason})`);
  skipped++;
}

async function surepassCall(token, gstin) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(SUREPASS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id_number: gstin }),
    signal: AbortSignal.timeout(8000),
  });
  return { status: res.status, body: await res.json() };
}

async function backendPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  return { status: res.status, body: await res.json() };
}

// ── 1. Environment ────────────────────────────────────────────────────────────
function testEnv() {
  console.log('\n┌─ 1. Environment');
  log('SUREPASS_TOKEN present in .env', !!SUREPASS_TOKEN,
    SUREPASS_TOKEN ? `...${SUREPASS_TOKEN.slice(-12)}` : 'MISSING');
  log('TOKEN is JWT format (3 parts)', !!SUREPASS_TOKEN && SUREPASS_TOKEN.split('.').length === 3,
    SUREPASS_TOKEN ? 'valid JWT structure' : 'not set');

  if (SUREPASS_TOKEN) {
    try {
      const payload = JSON.parse(Buffer.from(SUREPASS_TOKEN.split('.')[1], 'base64').toString());
      const expDate = new Date(payload.exp * 1000).toISOString();
      const isExpired = Date.now() / 1000 > payload.exp;
      log('TOKEN not expired', !isExpired, `expires ${expDate}`);
    } catch {
      log('TOKEN payload readable', false, 'cannot decode JWT payload');
    }
  }
}

// ── 2. Direct Surepass API ────────────────────────────────────────────────────
async function testSurepassDirect() {
  console.log('\n┌─ 2. Direct Surepass API (network test)');

  if (!SUREPASS_TOKEN) {
    skip('All direct Surepass tests', 'SUREPASS_TOKEN not set');
    return;
  }

  // Valid GST with token
  let directOk = false;
  try {
    const { status, body } = await surepassCall(SUREPASS_TOKEN, VALID_GST);
    directOk = status === 200 && body.success === true;
    log('Surepass API reachable', status === 200, `HTTP ${status}`);
    log('success:true for valid GST', body.success === true, String(body.success));
    log('id_number field accepted', body.message_code !== 'invalid_id',
      `message_code=${body.message_code}`);
    if (body.data) {
      log('business_name returned', !!body.data.business_name, body.data.business_name || 'missing');
      log('legal_name returned',    !!body.data.legal_name,    body.data.legal_name    || 'missing');
      log('gstin_status returned',  !!body.data.gstin_status,  body.data.gstin_status  || 'missing');
      log('gstin echoed back',      !!body.data.gstin,         body.data.gstin         || 'missing');
    }
  } catch (e) {
    console.log(`  ⚠️  Cannot reach Surepass directly (${e.message}) — skipping direct tests`);
    console.log('     This is OK if the machine blocks outbound HTTPS to surepass.io');
    console.log('     Backend proxy tests below will confirm end-to-end functionality.\n');
    skipped += 6;
    return;
  }

  // No token → must get 401
  try {
    const { status, body } = await surepassCall(null, VALID_GST);
    log('No token → 401 + missing_token code',
      status === 401 && body.message_code === 'missing_token',
      `status=${status} code=${body.message_code}`);
  } catch (e) {
    skip('No-token → 401 check', e.message);
  }

  // Wrong token → 401 invalid_token
  try {
    const { status, body } = await surepassCall('bad.token.here', VALID_GST);
    log('Bad token → 401 + invalid_token code',
      status === 401 && body.message_code === 'invalid_token',
      `status=${status} code=${body.message_code}`);
  } catch (e) {
    skip('Bad-token → 401 check', e.message);
  }
}

// ── 3. Backend proxy ──────────────────────────────────────────────────────────
async function testBackendProxy() {
  console.log('\n┌─ 3. Backend Proxy  POST /api/verify/gst');

  // Check backend is up
  let backendUp = false;
  try {
    const { status, body } = await backendPost('/verify/gst', { gstin: VALID_GST });
    backendUp = true;

    log('Backend reachable',          true, BASE_URL);
    log('Valid GST → HTTP 200',       status === 200,          `got ${status}`);
    log('success:true',               body.success === true,   String(body.success));
    log('data.legal_name present',    !!body.data?.legal_name, body.data?.legal_name    || 'missing');
    log('data.trade_name present',    !!body.data?.trade_name, body.data?.trade_name    || 'missing');
    log('data.gstin_status present',  !!body.data?.gstin_status, body.data?.gstin_status || 'missing');
    log('data.state present',         !!body.data?.state,      body.data?.state?.substring(0, 50) || 'missing');
    log('data.gstin echoed',          !!body.data?.gstin,      body.data?.gstin         || 'missing');
  } catch {
    log('Backend reachable', false, `Cannot connect to ${BASE_URL} — start with: npm run dev`);
    skipped += 12;
    return;
  }

  // Input validation: missing gstin
  {
    const { status, body } = await backendPost('/verify/gst', {});
    log('Missing gstin → 400',        status === 400, `got ${status}: "${body.message}"`);
  }

  // Input validation: bad format
  {
    const { status, body } = await backendPost('/verify/gst', { gstin: 'INVALID123' });
    log('Invalid format → 400',       status === 400, `got ${status}: "${body.message}"`);
  }

  // Too short
  {
    const { status } = await backendPost('/verify/gst', { gstin: '27AAA' });
    log('Too-short GST → 400',        status === 400, `got ${status}`);
  }

  // Lowercase — backend must uppercase before calling Surepass
  {
    const { status, body } = await backendPost('/verify/gst', { gstin: VALID_GST.toLowerCase() });
    log('Lowercase input → 200 (backend uppercases)', status === 200, `got ${status}`);
  }
}

// ── 4. Response shape ─────────────────────────────────────────────────────────
async function testResponseShape() {
  console.log('\n┌─ 4. Response Shape');

  let res;
  try {
    res = await backendPost('/verify/gst', { gstin: VALID_GST });
  } catch {
    skip('All shape tests', 'backend not running');
    return;
  }

  if (res.status !== 200) {
    skip('All shape tests', `backend returned ${res.status}`);
    return;
  }

  const d = res.body.data;
  log('data.gstin matches input',         d?.gstin?.toUpperCase() === VALID_GST, d?.gstin);
  log('data.legal_name is string',        typeof d?.legal_name === 'string',     typeof d?.legal_name);
  log('data.trade_name is string',        typeof d?.trade_name === 'string',     typeof d?.trade_name);
  log('data.gstin_status is string',      typeof d?.gstin_status === 'string',   d?.gstin_status);
  log('data.state is string',             typeof d?.state === 'string',          d?.state?.substring(0, 40));
  log('Raw surepass noise stripped',      !d?.address_details && !d?.filing_status && !d?.hsn_info,
    d?.address_details ? 'address_details leaked!' : 'clean ✓');
  log('success field is boolean',         typeof res.body.success === 'boolean', typeof res.body.success);
}

// ── Run all ───────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  GST Verification — Surepass API Test ║');
  console.log('╚═══════════════════════════════════════╝');

  testEnv();
  await testSurepassDirect();
  await testBackendProxy();
  await testResponseShape();

  const total = passed + failed + skipped;
  console.log('\n╔═══════════════════════════════════════╗');
  console.log(`║  ✅ ${String(passed).padEnd(3)} passed                        ║`);
  console.log(`║  ❌ ${String(failed).padEnd(3)} failed                        ║`);
  console.log(`║  ⏭️  ${String(skipped).padEnd(3)} skipped   (${total} total)           ║`);
  console.log('╚═══════════════════════════════════════╝\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
