import { CLOSED_CYCLE, DEMO_TODAY } from '../data/orders';
import type { OrderRow } from './fields';

/* ============================================================================
   The filter state — ONE set of values, shared, applied per dashboard.

   ⭐ Val's call, 10 Sept: there is no "everywhere" tier and no "this dashboard
   only" tier. Every filter belongs to the dashboard you are on, and each
   dashboard declares the fields its own modal offers.

   ## Why that is still one shared map, and not a copy per board

   The three things he asked for sound like three rules and are one mechanism:

     · a field two dashboards both offer keeps its value when you move between
       them;
     · a field the next dashboard does not offer is simply not applied there —
       it is not carried, and it is not silently in force;
     · coming back to the first dashboard, it is applied again.

   So the values live in ONE map keyed by field, and a board applies only the
   keys it declares (`Dashboard.filters`). Nothing has to be copied, migrated
   or cleared on a navigation — which is why none of the three cases needs its
   own code path, and why they cannot disagree.

   It also preserves the property the audit calls a genuine strength (F-14):
   Reporter's filters survive a tab change. They still do, for every field the
   next tab has. What is gone is only the CLAIM that some filters are global
   and others local, which was carried by two headings nobody asked for.

   (There is a third kind of filter, the widget's own binding filters, which
   are saved with the report and never surface on the board.)
   ========================================================================== */

export interface DateRange {
  id: string;
  label: string;
  from: string;
  to: string;
  /**
   * Whether this range ENDS TODAY rather than at a closed boundary.
   *
   * ⭐ The field the whole partial-period story hangs off. Reporter offers
   * seven ranges of which exactly one is closed; the rest end today, and
   * comparing four days against a full previous month is the audit's
   * highest-severity finding. Carrying the fact here means every widget on
   * the board can be told, once, from one place.
   */
  partial?: boolean;
  /** What is covered so far, in the reader's words: "4 of 30 days". */
  covered?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function monthToDate(): DateRange {
  const first = new Date(Date.UTC(DEMO_TODAY.getUTCFullYear(), DEMO_TODAY.getUTCMonth(), 1));
  const daysIn = new Date(
    Date.UTC(DEMO_TODAY.getUTCFullYear(), DEMO_TODAY.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return {
    id: 'month-to-date',
    label: 'This month',
    from: iso(first),
    to: iso(DEMO_TODAY),
    partial: true,
    covered: `${DEMO_TODAY.getUTCDate()} of ${daysIn} days`,
  };
}

/**
 * The ranges the product offers.
 *
 * ⭐ And the presets get FIXED, which is the other half of the F-01 answer.
 * Reporter offers seven of which one is closed. Here the two CLOSED periods
 * are first and one of them is the default, so the board a CEO opens is a
 * like-for-like comparison unless they deliberately ask for a running total.
 * The to-date ranges are still available — they are useful — and they are
 * marked.
 */
export const DATE_RANGES: DateRange[] = [
  {
    id: 'previous-cycle',
    label: 'Previous billing cycle',
    from: CLOSED_CYCLE.from,
    to: CLOSED_CYCLE.to,
  },
  { id: 'last-month', label: 'Last month', from: '2026-08-01', to: '2026-08-31' },
  { id: 'last-quarter', label: 'Last quarter', from: '2026-04-01', to: '2026-06-30' },
  /*
   * Two long CLOSED windows. The book carries 24 months, and without a range
   * that reaches into it every trend chart on the product renders three points
   * and a shrug — seasonality, the growth trend and the August mix shift are
   * all invisible at one billing cycle. Both end on a month boundary, so they
   * stay like-for-like comparisons rather than joining the to-date set.
   */
  { id: 'last-12-months', label: 'Last 12 months', from: '2025-09-01', to: '2026-08-31' },
  { id: 'last-year', label: 'Last year (2025)', from: '2025-01-01', to: '2025-12-31' },
  monthToDate(),
  {
    id: 'cycle-to-date',
    label: 'This billing cycle',
    from: '2026-08-16',
    to: iso(DEMO_TODAY),
    partial: true,
    covered: '25 of 31 days',
  },
  { id: 'year-to-date', label: 'This year', from: '2026-01-01', to: iso(DEMO_TODAY), partial: true, covered: '252 of 365 days' },
];

/** The default. A closed period, deliberately — see `DATE_RANGES`. */
export const DEFAULT_RANGE = DATE_RANGES[0];

/**
 * Everything the dashboards filter by.
 *
 * `values` is keyed by DIMENSION KEY — `org`, `requestCategory`, `status` —
 * and holds the values a reader has ticked. An absent key, or an empty array,
 * means no filter on that field: every value passes. Organization is one of
 * these like any other now; it used to be a field of its own on this type
 * because it was the "global" tier, and that tier is gone.
 *
 * The period is NOT in `values`, and that is not an oversight. A board always
 * covers some period — there is no unfiltered state for it — so it is a single
 * value rather than a set, it can never be cleared, and its pill has no ×.
 */
export interface Filters {
  range: DateRange;
  /** Dimension key -> the values allowed through. Absent means all of them. */
  values: Record<string, string[]>;
}

/** No filters, and the default closed period. What `Reset` returns to. */
export const EMPTY_FILTERS: Filters = { range: DEFAULT_RANGE, values: {} };

/**
 * Which date a period filter should test.
 *
 * ⭐ This exists because getting it wrong manufactures a movement that never
 * happened, which is the audit's own highest-severity class of finding.
 *
 * MEASURED, before the fix: the board filtered "last 12 months" on COMPLETION
 * (6,121 rows, Sep 2025 – Aug 2026) while the "Order activity" chart grouped by
 * SUBMISSION. Submission runs earlier than completion by the turnaround, so the
 * chart spread those rows over **14** buckets — and its two leading ones held 5
 * and 174 orders against a ~500 norm. The chart opened on a near-zero point
 * climbing to half height: a collapse and recovery that is pure artefact of
 * filtering one date and grouping another.
 *
 * So a widget that asks its question of a particular date gets filtered on that
 * date. `'either'` keeps the original blended rule for widgets with no date
 * dimension — a stat card counting completed orders wants completion where it
 * exists and submission otherwise, because "orders in August" means different
 * things for a completed order and an open one.
 */
export type DateBasis = 'submittedAt' | 'completedAt' | 'either';

/**
 * Apply the period to the book.
 *
 * `basis` says which date the range tests — see `DateBasis`. Filtering on
 * `completedAt` EXCLUDES open orders, which is correct: an order that has not
 * completed did not complete in this period.
 */
export function applyPeriod(
  rows: OrderRow[],
  range: DateRange,
  basis: DateBasis = 'either'
): OrderRow[] {
  return rows.filter((r) => {
    const when =
      basis === 'either' ? (r.completedAt ?? r.submittedAt) : (r[basis] as string | undefined);
    if (!when) return false;
    return when >= range.from && when <= range.to;
  });
}

/**
 * Apply the value filters a dashboard offers.
 *
 * ⭐ `keys` is the whole of the per-dashboard behaviour: the shared map may
 * hold a value for `reviewType` because the reader set one on AI Reviews, and
 * a board that does not offer that field must not quietly apply it. Passing
 * the board's own field list — rather than iterating the map — is what makes
 * "not carried forward" true rather than intended.
 *
 * `get` reads a dimension off a row; the caller owns the field catalogue.
 */
export function applyValues(
  rows: OrderRow[],
  values: Record<string, string[]>,
  keys: readonly string[],
  get: (row: OrderRow, key: string) => string
): OrderRow[] {
  return keys.reduce((acc, key) => {
    const allowed = values[key];
    if (!allowed?.length) return acc;
    return acc.filter((r) => allowed.includes(get(r, key)));
  }, rows);
}

/**
 * How many filters are in force on a board — for the button's badge.
 *
 * Counts the board's OWN fields, for the same reason `applyValues` takes them:
 * a badge reading 3 on a board applying 2 is worse than no badge. The period
 * is not counted — it always has a value, so counting it would floor the badge
 * at 1 and make "no filters" indistinguishable from "one filter".
 */
export function countFilters(values: Record<string, string[]>, keys: readonly string[]): number {
  return keys.filter((k) => values[k]?.length).length;
}
