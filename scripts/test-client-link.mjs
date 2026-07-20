/**
 * Quick check: does MOLLIE_ORG_ACCESS_TOKEN work for Client Links?
 *
 * Mirrors lib/mollie.ts → createProviderOnboarding (Client Links path).
 * Read-only-ish: it only CREATES a client link (no DB, no payment, no charge).
 *
 * Run:  node scripts/test-client-link.mjs
 */
import { readFileSync } from 'node:fs';
import { createMollieClient } from '@mollie/api-client';

// --- Load .env.local (no dependency on dotenv) ---
function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) {
        process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* ignore */
  }
}
loadEnv(new URL('../.env.local', import.meta.url).pathname);

const accessToken = process.env.MOLLIE_ORG_ACCESS_TOKEN;
const clientId = process.env.MOLLIE_PARTNER_CLIENT_ID;

const CONNECT_SCOPES = [
  'organizations.read',
  'onboarding.read',
  'onboarding.write',
  'profiles.read',
  'profiles.write',
  'payments.read',
  'settlements.read',
  'balances.read',
].join(' ');

console.log('— Mollie Client Links check —');
console.log('Access token :', accessToken ? accessToken.slice(0, 12) + '…' : '❌ MISSING');
console.log('Client ID    :', clientId || '❌ MISSING');
console.log('');

if (!accessToken || !clientId) {
  console.error('❌ MOLLIE_ORG_ACCESS_TOKEN and MOLLIE_PARTNER_CLIENT_ID must both be set in .env.local');
  process.exit(1);
}

const client = createMollieClient({ accessToken });

try {
  // Sample pre-filled provider data (same shape the real code sends).
  const clientLink = await client.clientLinks.create({
    owner: {
      email: 'test.provider@example.com',
      givenName: 'Test',
      familyName: 'Provider',
      locale: process.env.MOLLIE_DEFAULT_LOCALE || 'en_US',
    },
    name: 'Test Provider Business',
    address: { country: process.env.MOLLIE_DEFAULT_COUNTRY || 'NL' },
  });

  const url = clientLink.getClientLink({
    clientId,
    state: 'test-state-123',
    scope: CONNECT_SCOPES,
    approvalPrompt: 'force',
  });

  console.log('✅ SUCCESS — Client Link created. Pre-fill + clients.write scope work.');
  console.log('');
  console.log('Onboarding URL a provider would open:');
  console.log(url);
  console.log('');
  console.log('You can paste that URL in a browser to see the pre-filled Mollie onboarding.');
} catch (err) {
  console.error('❌ FAILED to create client link.');
  console.error('   status :', err.statusCode ?? err.status ?? '(unknown)');
  console.error('   message:', err.message);
  if (String(err.message).toLowerCase().includes('clients.write') || err.statusCode === 403) {
    console.error('');
    console.error('   👉 Most likely the access token is missing the `clients.write` scope.');
    console.error('      Edit the "Helpers-hob" API access token in Mollie → Developers');
    console.error('      → API access tokens, tick clients.write, save, then re-run.');
  }
  console.error('');
  console.error('   (Note: the app still works without this — it falls back to OAuth onboarding.)');
  process.exit(1);
}
