/*
 * Bucket counts per range × granularity, MEASURED off the real seed.
 *
 * PLAN.md §7 #5 suggests "under ~14 days daily, up to ~13 weeks weekly,
 * beyond that monthly" and says explicitly not to ship those numbers on
 * trust. This is the measurement. It counts DISTINCT BAND LABELS the field
 * catalogue's own `band()` produces for the rows a range actually contains —
 * not the arithmetic day count, because a band with no rows in it is not a
 * bucket on the chart.
 */
import { ORDERS } from '../src/data/orders.ts';
import { DATE_RANGES } from '../src/lib/context.ts';
import { DIMENSIONS } from '../src/lib/fields.ts';

const GRANS = ['day', 'week', 'month', 'cycle'];
const dim = (k) => DIMENSIONS.find((d) => d.key === k);

const spanDays = (r) =>
  Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;

for (const basis of ['submittedAt', 'completedAt']) {
  const d = dim(basis);
  console.log(`\n=== grouped by ${d.label} (${basis}), filtered on the same date ===`);
  console.log(
    'range'.padEnd(24),
    'days'.padStart(5),
    'rows'.padStart(7),
    ...GRANS.map((g) => g.padStart(7))
  );
  for (const r of DATE_RANGES) {
    const rows = ORDERS.filter((o) => {
      const when = o[basis];
      return when && when >= r.from && when <= r.to;
    });
    const counts = GRANS.map((g) => new Set(rows.map((o) => d.get(o, g))).size);
    console.log(
      r.id.padEnd(24),
      String(spanDays(r)).padStart(5),
      String(rows.length).padStart(7),
      ...counts.map((c) => String(c).padStart(7))
    );
  }
}
