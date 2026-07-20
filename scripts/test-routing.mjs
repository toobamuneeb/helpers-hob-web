/**
 * Decisive test: does Mollie payment ROUTING (Marketplaces/split model) work in
 * TEST mode for a given provider org? Creates a payment on the PLATFORM account
 * (MOLLIE_API_KEY) with routing[] → provider org. No app, no DB write.
 *
 * Run:  node scripts/test-routing.mjs <providerOrgId>   (default org_19557649)
 */
import { readFileSync } from 'node:fs';
import { createMollieClient } from '@mollie/api-client';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv(new URL('../.env.local', import.meta.url).pathname);

const apiKey = process.env.MOLLIE_API_KEY;
const providerOrg = process.argv[2] || 'org_19557649';
const isTest = apiKey?.startsWith('test_');

console.log('Mode        :', isTest ? 'TEST' : 'LIVE');
console.log('Platform key:', apiKey?.slice(0, 10) + '…');
console.log('Provider org:', providerOrg);
console.log('');

const client = createMollieClient({ apiKey });

try {
  const payment = await client.payments.create({
    amount: { currency: 'EUR', value: '10.00' },
    description: 'Routing test',
    redirectUrl: 'https://example.com/return',
    // NOTE: with an API key, test/live is decided by the key — do NOT send `testmode`.
    routing: [
      {
        amount: { currency: 'EUR', value: '8.00' },
        destination: { type: 'organization', organizationId: providerOrg },
      },
    ],
  });

  console.log('✅ ROUTING ACCEPTED — payment created:', payment.id, `(${payment.status})`);
  console.log('   checkout:', payment.getCheckoutUrl());
  console.log('\n👉 Routing WORKS in test mode for this provider. Safe to revert to routing model.');
} catch (err) {
  console.log('❌ ROUTING REJECTED');
  console.log('   status :', err.statusCode);
  console.log('   field  :', err.field);
  console.log('   message:', err.message);
  console.log('\n👉 Routing does NOT work here (keep the applicationFee model).');
}
