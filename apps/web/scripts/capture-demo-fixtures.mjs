// Refresh src/demo/fixtures.json for the static preview (NEXT_PUBLIC_DEMO=true) from a running API.
// Dev only: run `npm run seed:fixtures` on an empty DB, `npm run dev:api`, then
//   node apps/web/scripts/capture-demo-fixtures.mjs [http://localhost:4000/api/v1]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:4000/api/v1';
const headers = { 'x-dev-user': 'himani@bimakavach.com|Himani Doshi|placement_head' };
const SUBS = [
  'rfq/versions',
  'rfq/queries',
  'audit',
  'threads',
  'quotes',
  'qcrs',
  'insurer-entities',
  'mandate',
];

async function get(path) {
  const res = await fetch(`${base}${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const { items } = await get('/tickets?tab=all&scope=team&pageSize=200');
const tickets = [];
const sub = {};
for (const item of items) {
  tickets.push(await get(`/tickets/${item.id}`)); // TicketDetail is a superset of TicketListItem
  for (const s of SUBS) sub[`${item.id}/${s}`] = await get(`/tickets/${item.id}/${s}`);
}
const insurers = await get('/insurers');
const out = fileURLToPath(new URL('../src/demo/fixtures.json', import.meta.url));
writeFileSync(out, JSON.stringify({ capturedAt: new Date().toISOString(), tickets, sub, insurers }) + '\n');
console.log(
  `${tickets.length} tickets, ${Object.keys(sub).length} sub-resources, ${insurers.length} insurers -> ${out}`,
);
