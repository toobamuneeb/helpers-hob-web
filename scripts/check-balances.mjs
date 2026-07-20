/**
 * Diagnose the "Balance not found" routing error.
 *
 * Checks whether the PLATFORM and the connected PROVIDER organizations actually
 * have a usable Mollie balance (required for split payment routing).
 *
 * Run:  node scripts/check-balances.mjs <providerId-or-orgId?>
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv(new URL('../.env.local', import.meta.url).pathname);

async function balances(label, token) {
  process.stdout.write(`\n[${label}] GET /v2/balances … `);
  const res = await fetch('https://api.mollie.com/v2/balances', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`❌ ${res.status} ${body.detail || body.title || ''}`);
    return;
  }
  const list = body._embedded?.balances || [];
  console.log(`✅ ${list.length} balance(s)`);
  for (const b of list) {
    console.log(`   • ${b.id}  currency=${b.currency}  status=${b.status}  primary=${b.primary}  available=${b.availableAmount?.value ?? '?'}`);
  }
  if (list.length === 0) console.log('   ⚠️  No balances → routing here will fail with "Balance not found".');
}

const apiKey = process.env.MOLLIE_API_KEY;
console.log('Mode:', apiKey?.startsWith('test_') ? 'TEST' : 'LIVE');

// 1) Platform balances (the remainder after split lands here)
await balances('PLATFORM (api key)', apiKey);

// 2) Provider balances — read the stored OAuth token from the DB
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const arg = process.argv[2];
let q = supa.from('provider_bank_details').select('provider_id, mollie_connect_id, mollie_connect_status, mollie_access_token, mollie_refresh_token, token_expires_at, bank_verified');
if (arg) q = q.or(`provider_id.eq.${arg},mollie_connect_id.eq.${arg}`);
const { data: rows, error } = await q.limit(10);

if (error) { console.error('\nDB error:', error.message); process.exit(1); }
if (!rows?.length) { console.log('\nNo provider_bank_details rows found.'); process.exit(0); }

for (const r of rows) {
  console.log(`\n=== Provider ${r.provider_id} (org ${r.mollie_connect_id}, status=${r.mollie_connect_status}) ===`);
  if (!r.mollie_access_token) { console.log('  no access token stored'); continue; }
  const expired = r.token_expires_at && new Date(r.token_expires_at).getTime() < Date.now();
  if (expired) console.log(`  ⚠️ token expired at ${r.token_expires_at} (will likely 401 — reconnect provider for a fresh one)`);
  await balances(`PROVIDER ${r.mollie_connect_id}`, r.mollie_access_token);
}
