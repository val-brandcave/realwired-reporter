/* ============================================================================
   The field catalogue — the vocabulary a report can be built from.

   Every dimension (a category to group by) and every measure (a number to
   aggregate) Reporter's data supports, declared once with its label, its unit
   and how it is read off a row.

   ## Why this lives in the app and not in the library

   `@realwired/ui` owns the SHAPES — what a donut accepts, how small a table
   may be drawn, which chart answers which question. It must never learn what
   an appraisal is. This file is the other half: Reporter's own entities and
   measures, which are not BrickLayer's and not Vendor Circle's. Packaging it
   would be speculative until a second product genuinely shares it.

   The seam between them is `BindingShape` in the library — the app resolves
   its fields down to counts of dimensions and measures, and asks `fitsWidget`.

   ## This is deliberately the client's own vocabulary

   From the 8 Sept call: a dimension or a measure is one of his "individual
   facts", a bound widget is a "combination of facts", and the chart is the
   "module". Using his words means the builder and the copilot describe
   themselves in the language the client already uses for the problem.
   ========================================================================== */

import type { WidgetUnit } from '@realwired/ui';

/* ============================================================================
   The row every field reads
   ========================================================================== */

/**
 * One order, flattened.
 *
 * Reporter's real schema is SugarCRM's, joined across orders, organizations,
 * request types and reviews. A prototype does not need that join — it needs
 * one honest row shape that the same questions can be asked of. Where a field
 * is optional, an order that lacks it is SKIPPED when aggregating rather than
 * counted as zero: `undefined` and `0` are different facts, and the coverage
 * line exists to report the difference.
 */
export interface OrderRow {
  id: string;

  /* who */
  org: string;
  /** The organization's segment. Reporter groups by this on Client Portfolio. */
  segment: 'National bank' | 'Regional bank' | 'Credit union' | 'Non-bank lender';
  state: string;

  /* what */
  requestCategory:
    | 'Commercial appraisal'
    | 'Residential appraisal'
    | 'Evaluation'
    | 'Environmental'
    | 'Review'
    | 'Inspection';
  orderType: string;
  status: 'Complete' | 'In review' | 'In appraisal' | 'Awaiting assignment' | 'Cancelled';

  /* when — ISO dates, so a granularity band is a string slice */
  submittedAt: string;
  completedAt?: string;

  /* money */
  clientFee?: number;
  systemFee?: number;
  passThrough?: number;

  /* time */
  turnaroundDays?: number;
  vendorDays?: number;

  /* reviews */
  reviewType?: 'Administrative' | 'Technical' | 'Both';
  reviewSeconds?: number;
}

/* ============================================================================
   Aggregations
   ========================================================================== */

export type Aggregation = 'count' | 'sum' | 'avg' | 'median' | 'min' | 'max';

/** Terse, for the chip on a bound measure. */
export const AGG_LABEL: Record<Aggregation, string> = {
  count: 'count',
  sum: 'sum',
  avg: 'avg',
  median: 'med',
  min: 'min',
  max: 'max',
};

export const AGG_FULL: Record<Aggregation, string> = {
  count: 'Count',
  sum: 'Sum',
  avg: 'Average',
  median: 'Median',
  min: 'Minimum',
  max: 'Maximum',
};

/* ============================================================================
   Granularity
   ========================================================================== */

/**
 * How a date dimension is banded.
 *
 * `cycle` is Reporter's own billing cycle — the 16th to the 15th — and it is
 * here because it is the only closed period the product offers. Every other
 * preset ends today, which is the arithmetic behind the audit's F-01, so a
 * builder that could not express "by billing cycle" would push every user
 * back onto the ranges that mislead.
 */
export type Granularity = 'day' | 'week' | 'month' | 'cycle';

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  cycle: 'Billing cycle (16th–15th)',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO date to a band label, in the reader's terms rather than as a timestamp. */
function band(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';

  switch (g) {
    case 'day':
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    case 'week': {
      // The Monday of that week, which is how a weekly bucket is read.
      const day = d.getUTCDay();
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
      return `w/c ${monday.getUTCDate()} ${MONTHS[monday.getUTCMonth()]}`;
    }
    case 'cycle': {
      /*
       * The 16th to the 15th. An order on the 20th of July belongs to the
       * cycle NAMED July; one on the 10th of August belongs to the same cycle.
       * Getting this backwards silently moves a fortnight of revenue into the
       * wrong period, and it is the kind of error nobody spots on a chart.
       */
      const inNext = d.getUTCDate() >= 16;
      const m = inNext ? d.getUTCMonth() : (d.getUTCMonth() + 11) % 12;
      return `${MONTHS[m]} cycle`;
    }
    case 'month':
    default:
      return `${MONTHS[d.getUTCMonth()]}`;
  }
}

/* ============================================================================
   Dimensions
   ========================================================================== */

export interface DimensionField {
  key: string;
  label: string;
  /** One line, in the reader's terms. Feeds the builder's menu and the hint. */
  blurb: string;
  /** Honours the granularity control — i.e. it is a date. */
  granular?: boolean;
  /** Whether this dimension is a date, which several shapes require. */
  isTime?: boolean;
  /** Fixed category order, where the categories have one. */
  order?: string[];
  get: (row: OrderRow, g: Granularity) => string;
  /**
   * A sortable value behind the label, for dimensions whose labels do not
   * sort into their own order.
   *
   * ⭐ Dates are the whole reason this exists. A month band is labelled "Aug",
   * and "Aug" < "Jul" < "Jun" alphabetically — so a trend chart of the last
   * three months rendered its axis backwards, reading Aug, Jul, Jun left to
   * right. Every line on the board sloped the wrong way and nothing about it
   * looked broken.
   *
   * So a date dimension returns its ISO date here and the resolver sorts on
   * that. A category dimension has `order` or falls back to a locale compare,
   * both of which are correct for text.
   */
  sortValue?: (row: OrderRow) => string;
}

/**
 * The bucket for a row with nothing in the field.
 *
 * A named bucket rather than dropping the row. ⭐ This is the whole trust
 * argument in one constant: Reporter has 286 completed orders with no request
 * category, and a "revenue by category" chart that silently discards them is
 * off by $5,263 with no way for the reader to know. Named, the gap becomes a
 * task — which is what turns "the data is wrong" into "here is the 6% nobody
 * has classified".
 */
export const UNASSIGNED = 'Unassigned';

export const DIMENSIONS: DimensionField[] = [
  {
    key: 'org',
    label: 'Organization',
    blurb: 'The client bank or lender that placed the order.',
    get: (r) => r.org || UNASSIGNED,
  },
  {
    key: 'segment',
    label: 'Organization segment',
    blurb: 'What kind of institution the client is.',
    order: ['National bank', 'Regional bank', 'Credit union', 'Non-bank lender'],
    get: (r) => r.segment || UNASSIGNED,
  },
  {
    key: 'requestCategory',
    label: 'Request category',
    blurb: "Realwired's own classification of the work. Maintained per organization.",
    order: [
      'Commercial appraisal',
      'Residential appraisal',
      'Evaluation',
      'Environmental',
      'Review',
      'Inspection',
    ],
    get: (r) => r.requestCategory || UNASSIGNED,
  },
  {
    key: 'orderType',
    label: 'Order type',
    blurb: "The client's own order type, which is finer-grained than request category.",
    get: (r) => r.orderType || UNASSIGNED,
  },
  {
    key: 'status',
    label: 'Status',
    blurb: 'Where the order is now, not where it was during the period.',
    order: ['Awaiting assignment', 'In appraisal', 'In review', 'Complete', 'Cancelled'],
    get: (r) => r.status || UNASSIGNED,
  },
  {
    key: 'state',
    label: 'State',
    blurb: 'The state the subject property is in.',
    get: (r) => r.state || UNASSIGNED,
  },
  {
    key: 'reviewType',
    label: 'Review type',
    blurb: 'Administrative, technical, or both. Only orders with an AI review have one.',
    order: ['Administrative', 'Technical', 'Both'],
    get: (r) => r.reviewType ?? 'No review',
  },
  {
    key: 'submittedAt',
    label: 'Submitted date',
    blurb: 'When the order was placed.',
    granular: true,
    isTime: true,
    get: (r, g) => band(r.submittedAt, g),
    sortValue: (r) => r.submittedAt,
  },
  {
    key: 'completedAt',
    label: 'Completed date',
    blurb: 'When the order was delivered. An open order has none.',
    granular: true,
    isTime: true,
    get: (r, g) => (r.completedAt ? band(r.completedAt, g) : 'Not completed'),
    // An open order sorts last, after every dated band.
    sortValue: (r) => r.completedAt ?? '9999-12-31',
  },
];

/* ============================================================================
   Service levels
   ========================================================================== */

/**
 * The SLA for each request category, in calendar days.
 *
 * It lives in the field catalogue rather than beside the data because an SLA
 * is part of the VOCABULARY — a fact about what a category promises, the same
 * kind of thing as its label. Reporter carries these too; `Turnaround Time by
 * Category` is the only widget in the product that compares an actual against
 * a stated target, and it is the SLA reporting Jeff named as a tenant need.
 *
 * Two of the six are set so the prototype has genuine misses to report. A
 * demo where every category passes demonstrates nothing.
 */
export const CATEGORY_SLA: Record<string, number> = {
  'Commercial appraisal': 22,
  'Residential appraisal': 14,
  Evaluation: 7,
  Environmental: 21,
  Review: 5,
  Inspection: 5,
};

/* ============================================================================
   Measures
   ========================================================================== */

export interface MeasureField {
  key: string;
  label: string;
  blurb: string;
  unit: WidgetUnit;
  /** Bound when the field is picked. */
  defaultAgg: Aggregation;
  /**
   * Allowed aggregations, in menu order.
   *
   * `sum` is deliberately absent from every rate and duration. Summing
   * turnaround days across 4,228 orders produces a number with no meaning that
   * a chart will nonetheless draw, and a builder that offers it will have it
   * chosen. What cannot be asked cannot be got wrong.
   */
  aggs: Aggregation[];
  /** Read off a row. A `count` measure reads nothing. */
  get?: (row: OrderRow) => number | undefined;
  /**
   * This measure is a GOAL, so it belongs in a target slot and nowhere else.
   *
   * Declared rather than inferred, because the builder has to know before the
   * user acts: an SLA dropped into the measure slot plots a flat line at 22
   * days beside nothing to compare it to — a chart that renders, means
   * nothing, and looks like a mistake the user made. Naming the slot on the
   * field is how the builder can route it correctly on the first click.
   */
  targetOnly?: boolean;
}

const MONEY_AGGS: Aggregation[] = ['sum', 'avg', 'median', 'max', 'min'];
const RATE_AGGS: Aggregation[] = ['avg', 'median', 'max', 'min'];

export const MEASURES: MeasureField[] = [
  {
    key: 'orders',
    label: 'Orders',
    blurb: 'How many orders are in scope.',
    unit: 'count',
    defaultAgg: 'count',
    aggs: ['count'],
  },
  {
    key: 'classified',
    /*
     * ⭐ A fact about a row, not a statistic about the book — which is what
     * makes it an atom rather than something Insights computes for itself.
     *
     * Each order is either classified or it is not; averaged over a scope, that
     * IS the coverage percentage. So "how much of my book can I trust" becomes
     * an ordinary binding — a dial, a trend, a bar by organization — instead of
     * a number one screen knows how to calculate. That matters beyond Insights:
     * the whole premise is that nothing renders except from a spec, and a
     * coverage figure hard-coded into a page would be the first exception.
     *
     * 0 is a MEASUREMENT here, not a gap, which is why `get` never returns
     * undefined: an order with no category has definitely not been classified.
     * Compare `clientFee`, where an absent value means nobody recorded one.
     */
    label: 'Classified',
    blurb:
      'Whether the order has a request category. Averaged over a scope it is the share that do.',
    unit: 'pct',
    defaultAgg: 'avg',
    /* Only `avg`. Summing it counts orders in units of percent, and a builder
       that offers an aggregation will have it chosen. */
    aggs: ['avg'],
    get: (r) => (r.requestCategory ? 100 : 0),
  },
  {
    key: 'clientFee',
    label: 'Client fee',
    blurb: 'What the organization is billed. Includes pass-through costs.',
    unit: 'usd',
    defaultAgg: 'sum',
    aggs: MONEY_AGGS,
    get: (r) => r.clientFee,
  },
  {
    key: 'systemFee',
    label: 'System fee',
    blurb: "Realwired's share of the client fee. A subset of it, not an addition.",
    unit: 'usd',
    defaultAgg: 'sum',
    aggs: MONEY_AGGS,
    get: (r) => r.systemFee,
  },
  {
    key: 'passThrough',
    label: 'Pass-through',
    blurb: 'Vendor costs billed on to the organization. Not revenue.',
    unit: 'usd',
    defaultAgg: 'sum',
    aggs: MONEY_AGGS,
    get: (r) => r.passThrough,
  },
  {
    key: 'turnaroundDays',
    label: 'Turnaround',
    blurb: 'Calendar days from submission to completion, weekends included.',
    unit: 'days',
    defaultAgg: 'avg',
    aggs: RATE_AGGS,
    get: (r) => r.turnaroundDays,
  },
  {
    key: 'vendorDays',
    label: 'Vendor turnaround',
    blurb: 'Calendar days the appraiser took, from assignment to delivery. A subset of turnaround.',
    unit: 'days',
    defaultAgg: 'avg',
    aggs: RATE_AGGS,
    get: (r) => r.vendorDays,
  },
  {
    key: 'slaDays',
    /*
     * A DERIVED measure: it is not a column, it is looked up from the row's
     * category. Bound to a shape's target slot rather than plotted as a
     * series — which is why `avg` is the only aggregation offered. Every order
     * in a category shares its SLA, so the average of them IS the SLA, and
     * summing six identical numbers would produce a target of 132 days.
     */
    label: 'SLA target',
    blurb: "The promised turnaround for the order's request category, in calendar days.",
    unit: 'days',
    defaultAgg: 'avg',
    aggs: ['avg'],
    targetOnly: true,
    get: (r) => CATEGORY_SLA[r.requestCategory],
  },
  {
    key: 'reviewSeconds',
    label: 'Review completion time',
    blurb: 'Elapsed time from review initiation to completion.',
    unit: 'duration',
    defaultAgg: 'avg',
    aggs: RATE_AGGS,
    get: (r) => r.reviewSeconds,
  },
];

/* ============================================================================
   Lookups
   ========================================================================== */

export const findDimension = (key: string): DimensionField | undefined =>
  DIMENSIONS.find((d) => d.key === key);

export const findMeasure = (key: string): MeasureField | undefined =>
  MEASURES.find((m) => m.key === key);

/** Distinct values of a dimension, in declared order where it has one. */
export function dimensionValues(
  dimension: DimensionField,
  rows: OrderRow[],
  g: Granularity = 'month'
): string[] {
  const seen = [...new Set(rows.map((r) => dimension.get(r, g)))];
  if (!dimension.order) return seen.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const order = dimension.order;
  // An unknown value — `Unassigned`, `No review` — sorts LAST rather than
  // first, so a declared category list is never pushed down by a gap bucket.
  return seen.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
}

/** Sort comparator for a dimension's categories. */
export function categoryOrder(dimension: DimensionField): (a: string, b: string) => number {
  if (!dimension.order) return (a, b) => a.localeCompare(b, 'en', { numeric: true });
  const order = dimension.order;
  return (a, b) =>
    (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) -
    (order.indexOf(b) < 0 ? order.length : order.indexOf(b));
}
