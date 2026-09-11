/*
 * The figures the Insights screen states, measured on the APP'S OWN path.
 *
 * ⚠️ TRAPS §2: `status === 'Complete'` sounds like the definition of a
 * completed order and is NOT the app's definition of one. Every count here
 * goes through `applyPeriod(ORDERS, range, 'completedAt')` — every row with a
 * completion date in the period, whatever its status — because that is what
 * the widgets beside these sentences count. Measuring any other way produces
 * prose that disagrees with the coverage line one line below it.
 *
 * Run: npx tsx scripts/insights-probe.mjs
 */
import { ORDERS, ORGANIZATIONS, DEMO_TODAY } from '../src/data/orders.ts';
import { DATE_RANGES, applyPeriod } from '../src/lib/context.ts';
import { CATEGORY_SLA } from '../src/lib/fields.ts';

const range = (id) => DATE_RANGES.find((r) => r.id === id);
const AUG = range('last-month');
const YEAR = range('last-12-months');
const JUL = { id: 'jul', label: 'July', from: '2026-07-01', to: '2026-07-31' };

const money = (n) => '$' + Math.round(n).toLocaleString();
const sum = (rows, f) => rows.reduce((a, r) => a + (f(r) ?? 0), 0);
const pct = (n) => (n * 100).toFixed(1) + '%';

const aug = applyPeriod(ORDERS, AUG, 'completedAt');
const jul = applyPeriod(ORDERS, JUL, 'completedAt');
const year = applyPeriod(ORDERS, YEAR, 'completedAt');

console.log('=== 1 · COVERAGE (the band that leads) ===');
for (const [label, rows] of [['August', aug], ['Last 12 months', year]]) {
  const unc = rows.filter((r) => !r.requestCategory);
  const orgs = new Set(unc.map((r) => r.org));
  const byOrg = [...orgs]
    .map((o) => [o, unc.filter((r) => r.org === o).length])
    .sort((a, b) => b[1] - a[1]);
  const top4 = byOrg.slice(0, 4).reduce((a, [, n]) => a + n, 0);
  console.log(
    `${label}: ${rows.length} completed · unclassified ${unc.length} (${pct(unc.length / rows.length)})` +
      ` · classified ${pct(1 - unc.length / rows.length)}` +
      ` · systemFee ${money(sum(unc, (r) => r.systemFee))} · clientFee ${money(sum(unc, (r) => r.clientFee))}`,
  );
  console.log(
    `   spread over ${orgs.size} organizations · top 4 hold ${top4} (${pct(top4 / unc.length)})` +
      ` · top 4: ${byOrg.slice(0, 4).map(([o, n]) => `${o} ${n}`).join(' · ')}`,
  );
}

console.log('\n=== 2 · WHAT CHANGED ===');
console.log(
  `orders Aug ${aug.length} vs Jul ${jul.length} = ${((aug.length / jul.length - 1) * 100).toFixed(1)}%`,
);
const feeAug = sum(aug, (r) => r.clientFee);
const feeJul = sum(jul, (r) => r.clientFee);
console.log(
  `client fee Aug ${money(feeAug)} vs Jul ${money(feeJul)} = ${((feeAug / feeJul - 1) * 100).toFixed(1)}%`,
);
console.log(
  `avg fee/order Aug ${money(feeAug / aug.length)} vs Jul ${money(feeJul / jul.length)}`,
);

console.log('\nAugust turnaround by category, against SLA:');
const cats = [...new Set(ORDERS.map((r) => r.requestCategory).filter(Boolean))];
for (const c of cats) {
  const s = aug.filter((r) => r.requestCategory === c && r.turnaroundDays != null);
  const avg = sum(s, (r) => r.turnaroundDays) / s.length;
  const sla = CATEGORY_SLA[c];
  console.log(
    `  ${c.padEnd(23)} ${avg.toFixed(1)}d vs ${String(sla).padStart(2)}d  n=${String(s.length).padStart(3)}  ${avg > sla ? 'BREACH' : 'ok'}`,
  );
}

console.log('\nCommercial appraisal turnaround, by completion month (SLA 22):');
const months = [...new Set(year.map((r) => r.completedAt.slice(0, 7)))].sort();
for (const m of months) {
  const s = year.filter(
    (r) =>
      r.requestCategory === 'Commercial appraisal' &&
      r.completedAt.slice(0, 7) === m &&
      r.turnaroundDays != null,
  );
  if (!s.length) continue;
  const avg = sum(s, (r) => r.turnaroundDays) / s.length;
  console.log(`  ${m}  ${avg.toFixed(1)}d  n=${String(s.length).padStart(3)}  ${avg > 22 ? 'over' : ''}`);
}

console.log('\nAugust mix — share of orders vs share of client fee:');
for (const c of cats) {
  const s = aug.filter((r) => r.requestCategory === c);
  const sj = jul.filter((r) => r.requestCategory === c);
  console.log(
    `  ${c.padEnd(23)} orders ${pct(s.length / aug.length).padStart(6)} fee ${pct(sum(s, (r) => r.clientFee) / feeAug).padStart(6)}` +
      `  Jul→Aug ${sj.length}→${s.length}`,
  );
}

console.log('\n=== 3 · WHAT TO LOOK AT ===');
/* Declining, measured by the RULE the sentence states — volume down more than
   5% in each of the last two closed months — not read off the generator flag. */
const monthRows = (ym) =>
  applyPeriod(ORDERS, { id: ym, label: ym, from: `${ym}-01`, to: `${ym}-31` }, 'completedAt');
const [m1, m2, m3] = ['2026-06', '2026-07', '2026-08'].map(monthRows);
const countFor = (rows, org) => rows.filter((r) => r.org === org).length;
const declining = ORGANIZATIONS.map((o) => o.name).filter((name) => {
  const a = countFor(m1, name);
  const b = countFor(m2, name);
  const c = countFor(m3, name);
  if (a < 5) return false; // too small for a percentage to mean anything
  return b < a * 0.95 && c < b * 0.95;
});
console.log(`declining (>5% down two months running, base >=5): ${declining.length}`);
console.log('  ', declining.slice(0, 12).join(' · '));

const renewals = ORGANIZATIONS.filter((o) => o.contractEnd <= '2026-12-31');
console.log(`\nrenewals ending on or before 31 Dec 2026: ${renewals.length}`);
for (const o of renewals) {
  const recent = ORDERS.filter(
    (r) => r.org === o.name && (r.completedAt ?? r.submittedAt) >= '2026-07-11',
  ).length;
  console.log(`   ${o.contractEnd}  ${o.name}  (orders in last 60 days: ${recent})`);
}

/* Near-identical names, measured: one is a prefix of the other. */
const names = ORGANIZATIONS.map((o) => o.name).sort();
const pairs = [];
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    if (names[j].startsWith(names[i] + ' ')) pairs.push([names[i], names[j]]);
  }
}
console.log(`\nnear-identical name pairs (one is a prefix of the other): ${pairs.length}`);
for (const p of pairs) console.log('   ', p.join('  ⟷  '));

console.log(`\norganizations in the book: ${ORGANIZATIONS.length} · demo today ${DEMO_TODAY.toISOString().slice(0, 10)}`);
