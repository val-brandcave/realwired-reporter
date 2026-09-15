/* ============================================================================
   Binding — what a report IS, whether it fits, and how it resolves to data.

   Three jobs, in one file because they have to agree with each other:

     1. `ReportBinding`   the spec saved on a report
     2. `bindingShape`    the spec described in the library's terms, so the
                          library can judge it
     3. `resolveBinding`  group-by + aggregate, emitting the ONE dataset shape
                          every chart in the library consumes

   Pure and typed. No React, no fetching, no component imports.

   ## ⭐ What this file deliberately does NOT contain

   A constraint table. BrickLayer's equivalent carried its own `TYPE_RULES`,
   `validateBinding`, `WIDGET_LABEL` and `COMPOSABLE_TYPES` — which is exactly
   what `@realwired/ui` now publishes as `WIDGET_DEFINITIONS`, `fitsWidget`,
   `suggestWidgets` and `WIDGET_LIST`. Porting it would have recreated the
   second source of truth the library exists to end: two lists of which chart
   accepts what, in two repos, drifting.

   So validation is one function that translates a binding into a
   `BindingShape` and asks the library. The library knows shapes; this file
   knows Reporter. That seam is the whole architecture.

   ## And it emits ONE dataset, not nine

   BrickLayer needed `toDataset`, `toPie`, `toKpi`, `toGauge`, `toMatrix`,
   `toScatter`, `toTable` and `toMapPoints`, because each of its charts had its
   own prop shape. Every shape in `@realwired/ui` takes `WidgetDataset`, so
   there is one adapter — and adding a shape to the library does not add an
   adapter here.
   ========================================================================== */

import {
  fitsWidget,
  suggestWidgets,
  type BindingShape,
  type WidgetDataset,
  type WidgetDefinition,
  type WidgetFit,
  type WidgetRow,
  type WidgetTypeId,
} from '@realwired/ui';

import {
  categoryOrder,
  findDimension,
  findMeasure,
  UNASSIGNED,
  type Aggregation,
  type DimensionField,
  type Granularity,
  type MeasureField,
  type OrderRow,
} from './fields';

/* ============================================================================
   1 · The spec
   ========================================================================== */

export interface BoundMeasure {
  key: string;
  agg: Aggregation;
}

export type BindingSort = 'category' | 'measure-desc' | 'measure-asc';

export interface ReportBinding {
  /** The dimension along the category axis. */
  x: string | null;
  /** The measures plotted. */
  y: BoundMeasure[];
  /** A second dimension, which becomes the series. */
  breakdown: string | null;
  /** A measure acting as the goal, for `target`. */
  targetOf: string | null;
  /** Dimension key → allowed values. An empty list means no filter. */
  filters: Record<string, string[]>;
  /**
   * How a date dimension is banded — or `undefined` for AUTO.
   *
   * ⭐ Optional, and the optionality is the feature. `undefined` means "pick
   * the granularity that gives the active range a readable number of buckets";
   * a value means the author decided, and their decision wins for ever. See
   * `autoGranularity`.
   *
   * It is optional rather than a `'auto'` member of `Granularity` so that the
   * absence of a decision is the DEFAULT. A binding built by the builder, by
   * the copilot, or by spreading `EMPTY_BINDING` gets auto without anyone
   * remembering to ask for it, and the only way to pin a granularity is to
   * actually pin one.
   */
  granularity?: Granularity;
  sort: BindingSort;
  /** Keep only the top N categories. 0 means all of them. */
  limit: number;
  stacked: boolean;
  /**
   * The user asked for a SPREAD rather than a comparison.
   *
   * It cannot be inferred: binning one measure and plotting one measure with
   * no grouping are the same binding, and only the intent separates them.
   */
  bins: boolean;
}

export const EMPTY_BINDING: ReportBinding = {
  x: null,
  y: [],
  breakdown: null,
  targetOf: null,
  filters: {},
  /* Absent, not 'month'. Auto is the default — see `granularity`. */
  sort: 'category',
  limit: 0,
  stacked: false,
  bins: false,
};

/* ============================================================================
   2 · Asking the library whether it fits
   ========================================================================== */

/**
 * A binding, described in the library's terms.
 *
 * The translation is the seam: counts and flags go across, field names do not.
 * `series` is only known once the data is grouped, so the caller passes it
 * when it has resolved — the fit is still useful without it, it just cannot
 * warn about the palette cap yet.
 */
export function bindingShape(binding: ReportBinding, series?: number): BindingShape {
  const xDim = binding.x ? findDimension(binding.x) : undefined;
  const measures = binding.y.map((b) => findMeasure(b.key)).filter(Boolean) as MeasureField[];

  return {
    /*
     * The CATEGORY AXIS only. The breakdown is its own flag.
     *
     * These were summed into one count, and it mis-described every shipped
     * report with a split: the Overview's stacked area came out as two
     * dimensions and the library judged it unfit for the shape whose blurb
     * describes it. The dashboard never asked, so it drew correctly; the
     * builder asks, which is where it would have shown up.
     */
    dimensions: binding.x ? 1 : 0,
    breakdown: Boolean(binding.breakdown),
    // `undefined` rather than false when there is no dimension at all — the
    // library treats an UNKNOWN axis as not satisfying a time requirement, and
    // conflating "no dimension" with "not a date" would let a stacked area
    // through for a binding that never said it had one.
    timeAxis: xDim ? Boolean(xDim.isTime) : undefined,
    measures: measures.length,
    target: Boolean(binding.targetOf),
    series,
    bins: binding.bins,
    unit: measures[0]?.unit,
  };
}

/** Whether a shape can draw this binding, and what to change if not. */
export function validate(type: WidgetTypeId, binding: ReportBinding, series?: number): WidgetFit {
  return fitsWidget(type, bindingShape(binding, series));
}

/** Shapes that fit this binding, best first. The builder's list and the copilot's lookup. */
export function suggest(binding: ReportBinding, series?: number): WidgetDefinition[] {
  return suggestWidgets(bindingShape(binding, series));
}

/* ============================================================================
   3 · The resolver
   ========================================================================== */

export function aggregate(rows: OrderRow[], measure: MeasureField, agg: Aggregation): number | null {
  if (agg === 'count') return rows.length;

  const read = measure.get;
  if (!read) return rows.length;

  const values = rows
    .map(read)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  /*
   * No readable values means NULL, not zero.
   *
   * This is the single most consequential line in the file. A category where
   * nobody recorded a fee has not earned nothing — it has not been measured,
   * and the library's charts already draw those two facts differently (an em
   * dash, a broken line, a dashed cell). Returning 0 here would throw that
   * away at the source and no downstream component could recover it.
   */
  if (values.length === 0) return null;

  switch (agg) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    default:
      // Declared `: number | null`, so every path must return one. The
      // BrickLayer version had no default and leaked `undefined` into a
      // formatter, which threw a long way from the cause.
      return values.reduce((a, b) => a + b, 0);
  }
}

/**
 * Rows left after the binding's own filters. Also the denominator in provenance.
 *
 * `g` is the granularity the binding RESOLVED at, passed in rather than read
 * off the binding, so a filter on a date dimension tests the same bands the
 * chart draws. Reading `binding.granularity` here would test the author's
 * pinned value while the chart drew the auto one — two different questions
 * about one widget, which is the class of defect TRAPS §3 is about.
 */
export function applyFilters(
  rows: OrderRow[],
  binding: ReportBinding,
  g: Granularity = 'month'
): OrderRow[] {
  return Object.entries(binding.filters).reduce((acc, [key, allowed]) => {
    if (!allowed?.length) return acc;
    const dimension = findDimension(key);
    if (!dimension) return acc;
    return acc.filter((r) => allowed.includes(dimension.get(r, g)));
  }, rows);
}

export interface ResolvedBinding {
  dataset: WidgetDataset;
  /** Rows the figures were built from, after filters. */
  scoped: OrderRow[];
  /** How many series the grouping produced — feeds the fold warning. */
  series: number;
  /** The measures actually bound, resolved. */
  measures: { field: MeasureField; agg: Aggregation }[];
  /** The x dimension, resolved. */
  dimension?: DimensionField;
  /**
   * The granularity the dates were actually banded at.
   *
   * Reported rather than left implicit because the toolbar has to show it: a
   * segmented control sitting on `month` while the chart draws weeks is a
   * control that lies about its own subject.
   */
  granularity: Granularity;
  /**
   * Present only for a binned spread.
   *
   * `medianIndex` is which BAND holds the middle observation. The chart takes
   * it as `medianBin` and marks the band; it is not a position on the axis,
   * because binned data cannot honestly claim one.
   */
  bins?: { medianIndex: number };
}

const X_KEY = 'category';
/** Index-based, so a breakdown's arbitrary labels cannot collide with `category`. */
const seriesKey = (i: number) => `s${i}`;
const TARGET_KEY = 'target';

/**
 * Group, aggregate, and emit a `WidgetDataset`.
 *
 * The output is the library's one dataset shape, so the same resolved binding
 * feeds a bar, a donut, a table or a chat message without a second adapter.
 */
export function resolveBinding(
  binding: ReportBinding,
  rows: OrderRow[],
  /**
   * The active period, for auto-granularity. Omit and the binding falls back
   * to `month` — see `bindingGranularity`.
   */
  range?: { from: string; to: string }
): ResolvedBinding {
  /*
   * Read ONCE, at the top, and used for every band in this function.
   *
   * Grouping, the breakdown, the sort keys and the binding's own filters all
   * have to agree on which band a row is in. Calling `bindingGranularity`
   * per use would be the same value four times today and four chances to
   * disagree the moment one of them takes a different argument.
   */
  const grain = bindingGranularity(binding, range);
  const scoped = applyFilters(rows, binding, grain);

  const measures = binding.y
    .map((b) => {
      const field = findMeasure(b.key);
      return field ? { field, agg: b.agg } : null;
    })
    .filter((m): m is { field: MeasureField; agg: Aggregation } => m !== null);

  const dimension = binding.x ? findDimension(binding.x) : undefined;
  const breakdown = binding.breakdown ? findDimension(binding.breakdown) : undefined;
  const target = binding.targetOf ? findMeasure(binding.targetOf) : undefined;
  const unit = measures[0]?.field.unit ?? 'count';

  /* ---- a SPREAD rather than a comparison: bin one measure ---- */
  if (binding.bins && !dimension && measures[0]) {
    const binned = binMeasure(scoped, measures[0].field);
    if (binned) {
      return {
        scoped,
        measures,
        granularity: grain,
        series: 1,
        bins: { medianIndex: binned.medianIndex },
        dataset: {
          xKey: X_KEY,
          /* COUNTS, not the measure's own unit. The bars are how many orders
             fell in a band; the measure is what the bands are OF, and that
             goes to `binOf`. Leaving the unit as currency drew "$115" where
             115 orders were meant. */
          unit: 'count',
          binOf: measures[0].field.label,
          series: [{ key: seriesKey(0), label: 'Orders', colorIndex: 0 }],
          data: binned.data,
        },
      };
    }
  }

  /* ---- no dimension: one row of whole-scope totals (stat, dial) ---- */
  if (!dimension) {
    const row: WidgetRow = { [X_KEY]: 'Total' };
    measures.forEach((m, i) => {
      row[seriesKey(i)] = aggregate(scoped, m.field, m.agg);
    });
    return {
      scoped,
      measures,
      granularity: grain,
      series: measures.length,
      dataset: {
        xKey: X_KEY,
        unit,
        series: measures.map((m, i) => ({
          key: seriesKey(i),
          label: m.field.label,
          colorIndex: i,
        })),
        data: [row],
      },
    };
  }

  /* ---- group by x, and within each group by the breakdown ---- */
  const groups = new Map<string, { rows: OrderRow[]; sub: Map<string, OrderRow[]> }>();
  for (const r of scoped) {
    const kx = dimension.get(r, grain);
    let g = groups.get(kx);
    if (!g) {
      g = { rows: [], sub: new Map() };
      groups.set(kx, g);
    }
    g.rows.push(r);
    if (breakdown) {
      const kb = breakdown.get(r, grain);
      const bucket = g.sub.get(kb);
      if (bucket) bucket.push(r);
      else g.sub.set(kb, [r]);
    }
  }

  const seriesLabels = breakdown
    ? [...new Set(scoped.map((r) => breakdown.get(r, grain)))].sort(
        categoryOrder(breakdown)
      )
    : measures.map((m) => m.field.label);

  /*
   * The chronological key per group, for a date axis.
   *
   * The MIN raw date in the group: every row in a month band shares the
   * month, so any of them would do, and taking the minimum is also right for
   * a band that straddles a boundary. Without this the resolver sorted month
   * labels as text — see `sortValue` in the field catalogue for what that
   * looked like on screen.
   */
  const sortKeys = new Map<string, string>();
  if (dimension.sortValue) {
    for (const r of scoped) {
      const label = dimension.get(r, grain);
      const key = dimension.sortValue(r);
      const held = sortKeys.get(label);
      if (held === undefined || key < held) sortKeys.set(label, key);
    }
  }

  let entries = [...groups.entries()].map(([label, g]) => {
    const values = breakdown
      ? // Broken down, the FIRST measure is applied across the series. A
        // breakdown and multiple measures are two ways to make series and the
        // chart has one series axis, so the binding has to pick.
        seriesLabels.map((name) => {
          const bucket = g.sub.get(name);
          return bucket ? aggregate(bucket, measures[0].field, measures[0].agg) : null;
        })
      : measures.map((m) => aggregate(g.rows, m.field, m.agg));

    const total = values.reduce<number>((a, b) => a + (b ?? 0), 0);
    return { label, values, total, rows: g.rows };
  });

  if (binding.sort === 'category') {
    entries.sort((a, b) =>
      dimension.sortValue
        ? (sortKeys.get(a.label) ?? '').localeCompare(sortKeys.get(b.label) ?? '')
        : categoryOrder(dimension)(a.label, b.label)
    );
  } else {
    entries.sort((a, b) => (binding.sort === 'measure-asc' ? a.total - b.total : b.total - a.total));
  }
  if (binding.limit > 0) entries = entries.slice(0, binding.limit);

  const data: WidgetRow[] = entries.map((e) => {
    const row: WidgetRow = { [X_KEY]: e.label };
    e.values.forEach((v, i) => {
      // Rounded to two places so a floating-point average does not reach a
      // formatter as 22.800000000000004 and defeat its own decimal rule.
      row[seriesKey(i)] = v === null ? null : Math.round(v * 100) / 100;
    });
    if (target) {
      const t = aggregate(e.rows, target, 'avg');
      row[TARGET_KEY] = t === null ? null : Math.round(t * 100) / 100;
    }
    return row;
  });

  return {
    scoped,
    measures,
    dimension,
    granularity: grain,
    series: seriesLabels.length,
    dataset: {
      xKey: X_KEY,
      unit,
      targetKey: target ? TARGET_KEY : undefined,
      binOf: binding.bins ? measures[0]?.field.label : undefined,
      series: seriesLabels.map((label, i) => ({ key: seriesKey(i), label, colorIndex: i })),
      data,
    },
  };
}

/**
 * One measure, spread across bands.
 *
 * ## Why this lives in the app and not in the chart
 *
 * `DistributionViz` takes bands and counts. It cannot bin for itself: by the
 * time a dataset reaches a chart the rows are gone, and a median recovered
 * from band counts would be a guess presented as a measurement. So the caller
 * bins, and the caller says which band holds the middle observation.
 *
 * ## The band width is chosen, not fixed
 *
 * A fee book with a hard tail — which this one has — makes the naive choice
 * wrong in both directions. Banding to the MAXIMUM gives forty bands with one
 * order in the last; banding to a fixed width gives a first band holding
 * everything. So the width comes off the 95th percentile on a 1/2/5 x 10^n
 * progression, five closed bands, and everything above the top boundary goes
 * into ONE open-ended band. That is what makes the tail legible as a tail
 * rather than as forty empty columns.
 *
 * ⚠️ The open band is why the count is honest and the mean is not recoverable
 * from this chart. Do not let anything downstream compute an average from
 * these bars.
 */
function binMeasure(
  rows: OrderRow[],
  field: MeasureField
): { data: WidgetRow[]; medianIndex: number } | null {
  const read = field.get;
  if (!read) return null;

  const values = rows
    .map(read)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);

  if (values.length === 0) return null;

  const CLOSED_BANDS = 5;

  /*
   * The band width comes off the MEDIAN, not off the range.
   *
   * ⚠️ MEASURED, and the first attempt was wrong. Anchoring on the 95th
   * percentile put 83.4% of orders in one band and drew the other five as
   * slivers — true, but a chart that spends five sixths of its width on 16.6%
   * of the book is not showing a spread, it is showing one bar.
   *
   * A fee book is a skewed positive distribution, so the median is the scale
   * that matters: a first band roughly one median wide holds about half the
   * orders, and the structure inside the bulk becomes visible instead of being
   * compressed into a single column. The artboard reaches the same place from
   * its own numbers — it draws $20 bands against a median of $18.
   *
   * The tail is not lost, it moves into the open band, which is what an open
   * band is for.
   */
  const median = values[Math.floor((values.length - 1) / 2)];
  const p95 = values[Math.min(values.length - 1, Math.floor(values.length * 0.95))];

  /* A median of zero says half the book is unpriced — fall back to the spread
     so the chart still draws something rather than banding on nothing. */
  const raw = median > 0 ? median : p95 / CLOSED_BANDS;
  if (!(raw > 0)) return null;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude;

  const money = field.unit === 'usd';
  /*
   * The unit is written on the FIRST band and again on the open one, and
   * nowhere else — the artboard's own economy. The axis establishes what it
   * is counting once, restates it where the band stops being a range, and
   * spends no width repeating a dollar sign six times.
   */
  const amount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const money$ = (n: number) => (money ? `$${amount(n)}` : amount(n));

  const counts = new Array<number>(CLOSED_BANDS + 1).fill(0);
  const bandOf = (v: number) => Math.min(CLOSED_BANDS, Math.floor(v / step));
  for (const v of values) counts[bandOf(v)] += 1;

  const label = (i: number) =>
    i === CLOSED_BANDS
      ? `${money$(step * CLOSED_BANDS)}+`
      : i === 0
        ? `${money$(0)}–${amount(step)}`
        : `${amount(step * i)}–${amount(step * (i + 1))}`;

  const data: WidgetRow[] = counts.map((count, i) => ({
    [X_KEY]: label(i),
    [seriesKey(0)]: count,
  }));

  /*
   * The median BAND, by index. The true median is known here because the raw
   * values are — it is deliberately not passed on as a number, because the
   * chart can only honestly say which band the middle observation fell in.
   */
  return { data, medianIndex: bandOf(median) };
}

/* ============================================================================
   4 · Provenance and a default title
   ========================================================================== */

/**
 * What the widget read, and how much of it.
 *
 * ⭐ The trust lever. The blocker on this product is confidence rather than
 * features, and
 * the diagnosis from the 8 Sept call is that the data is not wrong — the
 * maintenance was not done. A coverage line turns "I don't trust this" into
 * "this is 94% of the book, here are the 6% nobody has classified", which is
 * an accusation becoming a task. It helps Ed as much as her, because usage is
 * what drives the maintenance he needs.
 */
export function bindingCoverage(
  resolved: ResolvedBinding,
  allRows: OrderRow[],
  noun = 'orders'
): { included: number; total: number; noun: string; gapReason?: string } {
  const included = resolved.scoped.length;
  const total = allRows.length;

  if (included >= total) return { included, total, noun };

  const excluded = total - included;
  return {
    included,
    total,
    noun,
    gapReason: `${excluded.toLocaleString()} ${noun} are outside this widget's filters and are in none of the figures above.`,
  };
}

/**
 * How many of the rows in view have nothing in the grouping dimension.
 *
 * ⚠️ This is NOT the same fact as `bindingCoverage`, and conflating the two
 * was a real defect. Coverage answers *"how much of the book did this widget's
 * FILTERS let through?"* — an unclassified order passes every filter, so it is
 * fully included and coverage correctly reads 100%.
 *
 * The classification gap is a different question: *"of the rows that ARE here,
 * how many could not be put in a bucket?"* Those rows are named `Unassigned`
 * rather than dropped, so the money is never silently missing — but a reader
 * who sees a 100% coverage line beside an `Unassigned` slice has been handed a
 * contradiction to resolve, and resolving it is not their job.
 *
 * So: state it. The gap is the maintenance task the 8 Sept call identified as
 * the real cause of "the data is wrong", and naming it is what turns an
 * accusation into something someone can go and do.
 */
export function classificationGap(
  resolved: ResolvedBinding,
  granularity: Granularity = 'month'
): { count: number; share: number; fee: number; label: string } | undefined {
  const dim = resolved.dimension;
  if (!dim) return undefined;

  /*
   * Granularity is immaterial here and defaulted for that reason: a non-date
   * dimension ignores it, and a date is either recorded or it is not — which
   * bucket a recorded date falls into cannot change whether it is missing.
   * It is threaded through only so the call reads like every other `get`.
   */
  const missing = resolved.scoped.filter((r) => dim.get(r, granularity) === UNASSIGNED);
  if (missing.length === 0) return undefined;

  const fee = missing.reduce((a, r) => a + (r.systemFee ?? 0), 0);
  const share = missing.length / resolved.scoped.length;

  return { count: missing.length, share, fee, label: dim.label.toLowerCase() };
}

/**
 * Which date this binding's period filter should test.
 *
 * Derived from the binding rather than declared on the report, so a molecule
 * cannot disagree with itself: if the chart groups by submission month, the
 * period means submission. Swapping the x dimension in the builder therefore
 * moves the filter with it, for free.
 *
 * See `DateBasis` in `context.ts` for the defect this prevents.
 */
export function bindingDateBasis(binding: ReportBinding): 'submittedAt' | 'completedAt' | 'either' {
  if (binding.x === 'submittedAt' || binding.x === 'completedAt') return binding.x;
  return 'either';
}

/* ============================================================================
   4.1 · Auto-granularity
   ========================================================================== */

/**
 * The two thresholds, in days of range length. MEASURED — see below.
 *
 * Kept as named constants rather than inlined because the numbers are evidence
 * and evidence needs somewhere to be cited from.
 */
export const GRANULARITY_THRESHOLD_DAYS = { day: 14, week: 91 } as const;

/**
 * Which granularity gives this range a readable number of buckets.
 *
 * ⭐ The PLAN.md §7 #5 decision, resolved by Val on 10 Sept. The problem it
 * fixes: on the default period ("Previous billing cycle", 16 Jul – 15 Aug) a
 * monthly trend has TWO buckets, so the Overview's hero chart opened as a flat
 * two-point line. Honest, and a weak opening frame.
 *
 * The fix is deliberately NOT a change of default period. The closed-period
 * default is the F-01 answer — see `DATE_RANGES` — and it is not being traded
 * for a nicer-looking chart. Instead a date dimension resolves at whatever
 * band gives the range a legible number of points, which fixes every
 * short-range trend on every board, present and future, rather than papering
 * over the one chart somebody noticed.
 *
 * ## ⚠️ The numbers below are MEASURED, not the ones the plan suggested
 *
 * PLAN.md proposed "under ~14 days daily, up to ~13 weeks weekly, beyond that
 * monthly" and said explicitly not to ship them on trust. So they were run
 * against the real seed — `npx tsx scripts/granularity-probe.mjs`, which counts
 * DISTINCT BAND LABELS the field catalogue's own `band()` produces for the rows
 * each range actually contains. Not the arithmetic day count: a band with no
 * rows in it is not a bucket on the chart.
 *
 * Measured 10 Sept, 11,314 orders, grouped by submission (completion is within
 * one bucket of it on every row):
 *
 * | range              | days |  day |  week | month | AUTO PICKS | buckets |
 * |--------------------|-----:|-----:|------:|------:|------------|--------:|
 * | month-to-date      |    9 |    9 |     2 |     1 | **day**    |   **9** |
 * | cycle-to-date      |   25 |   25 |     5 |     2 | **week**   |   **5** |
 * | previous-cycle ⭐  |   31 |   31 |     5 |     2 | **week**   |   **5** |
 * | last-month         |   31 |   31 |     6 |     1 | **week**   |   **6** |
 * | last-quarter       |   91 |   91 |    14 |     3 | **week**   |  **14** |
 * | year-to-date       |  252 |  252 |    37 |     9 | **month**  |   **9** |
 * | last-12-months     |  365 |  365 |    53 |    12 | **month**  |  **12** |
 * | last-year          |  365 |  365 |    53 |    12 | **month**  |  **12** |
 *
 * The suggested thresholds survived the measurement, so they ship as 14 and 91.
 * Every range now lands between **5 and 14** buckets against a target band of
 * 6–14, and the default period — the whole point of the exercise — goes from
 * **2 points to 5**.
 *
 * Two land at 5 rather than 6, and that is the floor of what is available
 * rather than a miss: a 31-day cycle offers 31 daily buckets, 5 weekly or 2
 * monthly, and there is no fourth option. Deliberately not tuned harder — the
 * alternative was inventing a fortnightly band nobody asked for, and 91 days
 * lands exactly on the 14-bucket ceiling, so widening the weekly window costs
 * more than it buys.
 *
 * ## `cycle` is never chosen automatically
 *
 * It is Reporter's own billing period, so selecting it is a statement about
 * what a reader is looking at rather than a fit to a window — and measured, it
 * would be the wrong fit anyway: 1 bucket on the default period, 2 on last
 * month, 4 on last quarter. It stays available as an explicit choice.
 */
export function autoGranularity(range: { from: string; to: string }): Granularity {
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days <= 0) return 'month';
  if (days <= GRANULARITY_THRESHOLD_DAYS.day) return 'day';
  if (days <= GRANULARITY_THRESHOLD_DAYS.week) return 'week';
  return 'month';
}

/**
 * The granularity this binding actually resolves at.
 *
 * ⭐ An explicit granularity WINS, always. Auto is the default, not an
 * override: a report someone deliberately set to monthly stays monthly however
 * the range moves, because that decision is part of what the report means.
 * `Client utilization` is the live example — its hint says "per month", so its
 * binding pins `month` and the sentence cannot come apart from the chart.
 *
 * Lives here, beside `bindingDateBasis`, and for the same reason: it is
 * derived from the binding rather than declared alongside it, so a molecule
 * cannot disagree with itself. `resolveBinding` is the only caller that
 * matters — the granularity a chart is drawn at and the granularity its filters
 * are tested at are one value, read once.
 *
 * With no range in hand — a preview with no period selected — it falls back to
 * `month`, which is what the binding used to hard-code.
 */
export function bindingGranularity(
  binding: ReportBinding,
  range?: { from: string; to: string }
): Granularity {
  if (binding.granularity) return binding.granularity;
  return range ? autoGranularity(range) : 'month';
}

/* ============================================================================
   4.2 · Clipped edge bands
   ========================================================================== */

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** The calendar span of the band a date falls in, for a given granularity. */
function bandBounds(iso: string, g: Granularity): { start: number; end: number } {
  const t = utc(iso);
  const d = new Date(t);

  switch (g) {
    case 'day':
      return { start: t, end: t };
    case 'week': {
      /* Monday-anchored, matching `band()` in the field catalogue. The two
         must agree: if this function thought weeks began on Sunday it would
         report clipping on bands that are whole, and miss the ones that are not. */
      const back = (d.getUTCDay() + 6) % 7;
      const start = t - back * DAY_MS;
      return { start, end: start + 6 * DAY_MS };
    }
    case 'cycle': {
      /* The 16th to the 15th — again matching `band()`. */
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const day = d.getUTCDate();
      const start = day >= 16 ? Date.UTC(y, m, 16) : Date.UTC(y, m - 1, 16);
      return { start, end: new Date(start).setUTCMonth(new Date(start).getUTCMonth() + 1) - DAY_MS };
    }
    case 'month':
    default: {
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
      return { start, end };
    }
  }
}

export interface EdgeClip {
  /** Which end of the axis. */
  edge: 'first' | 'last';
  /** Days of the band the range actually covers. */
  covered: number;
  /** Days the band holds when whole. */
  length: number;
}

/**
 * Which end bands a range only PARTLY covers.
 *
 * ⚠️ Found by measuring, immediately after auto-granularity shipped, and it is
 * the reason this function exists rather than a note in a doc.
 *
 * A range almost never starts on a Monday or ends on a month end, so the first
 * and last bands of a trend hold fewer days than the ones between them — and a
 * line chart draws that shortfall as a MOVEMENT. Measured on the seed, orders
 * per band against the interior average:
 *
 * | range                    | band  | first | last |
 * |--------------------------|-------|------:|-----:|
 * | previous-cycle (default) | week  |  0.55 | 0.88 |
 * | last-month               | week  |  0.34 | 0.13 |
 * | last-quarter             | week  |  0.55 | 0.32 |
 * | cycle-to-date            | week  |  0.15 | 0.41 |
 * | year-to-date             | month |  0.72 | 0.30 |
 *
 * So the default board's hero chart opened at 55% of normal and climbed: a
 * collapse and recovery that never happened, which is the audit's own
 * highest-severity class of finding (F-01) and TRAPS §3 reproduced by our own
 * hand. Nothing errored. The chart was beautiful.
 *
 * ## Why the answer is to SAY it rather than to avoid it
 *
 * Three alternatives were considered and each is worse:
 *
 * - **Drop the clipped bands.** Every row in them is real. Dropping them puts
 *   the coverage line — which would still read 100% — in contradiction with a
 *   chart that silently omits 71 orders. That is the defect TRAPS §3 already
 *   names once.
 * - **Widen the range to whole bands.** The period is the reader's question.
 *   Answering a different one because it plots better is the F-01 mistake with
 *   the sign flipped.
 * - **Pick a band that divides the range.** Measured: there isn't one. Of the
 *   eight ranges, the only never-clipping band is `day`, which gives 31–365
 *   points; every band landing in the readable 6–14 clips at least one end.
 *   Clipping is not a bug in the thresholds, it is a property of asking for a
 *   readable number of buckets over an arbitrary window.
 *
 * Which leaves labelling — and that is the answer this product already gives
 * to the same question one level up. A to-date RANGE is not hidden or
 * rounded off, it is marked `partial`, its coverage stated in days, and its
 * delta stripped of colour. A clipped BAND is the same fact at a smaller
 * scale, so it gets the same treatment.
 */
export function edgeClips(
  binding: ReportBinding,
  range?: { from: string; to: string },
  granularity?: Granularity
): EdgeClip[] {
  if (!range) return [];

  const dim = binding.x ? findDimension(binding.x) : undefined;
  if (!dim?.granular) return [];

  const g = granularity ?? bindingGranularity(binding, range);
  /* A day is never a partial day. */
  if (g === 'day') return [];

  const from = utc(range.from);
  const to = utc(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];

  const days = (a: number, b: number) => Math.round((b - a) / DAY_MS) + 1;
  const out: EdgeClip[] = [];

  const first = bandBounds(range.from, g);
  const firstEnd = Math.min(first.end, to);
  if (from > first.start) {
    out.push({ edge: 'first', covered: days(from, firstEnd), length: days(first.start, first.end) });
  }

  const last = bandBounds(range.to, g);
  /*
   * Only when the two ends are DIFFERENT bands. A range inside one band is a
   * single point, already clipped at both ends, and reporting it twice would
   * describe a "first and last" that are one thing.
   */
  if (last.start !== first.start && to < last.end) {
    out.push({ edge: 'last', covered: days(Math.max(from, last.start), to), length: days(last.start, last.end) });
  }

  return out;
}

/** The band's name in the reader's words, for the sentence. */
export const BAND_NOUN: Record<Granularity, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  cycle: 'billing cycle',
};

/** A readable title from the binding, so an untouched report still reads well. */
export function describeBinding(binding: ReportBinding): string {
  const measures = binding.y.map((b) => findMeasure(b.key)?.label).filter(Boolean);
  if (measures.length === 0) return 'Untitled report';

  const lead = measures.join(' and ');
  const dim = binding.x ? findDimension(binding.x)?.label : undefined;
  const split = binding.breakdown ? findDimension(binding.breakdown)?.label : undefined;

  let title = lead;
  if (dim) title += ` by ${dim.toLowerCase()}`;
  if (split) title += `, split by ${split.toLowerCase()}`;
  return title;
}

/* ============================================================================
   5 · The toolbar plan
   ========================================================================== */

/**
 * Which display controls this binding can actually use.
 *
 * Nothing is ever disabled. BrickLayer's rail showed four selects of which
 * three were usually greyed with a sentence underneath explaining why a
 * control you cannot use exists; here a control that does not apply is
 * ABSENT, and the row growing and shrinking as you build is its own
 * explanation.
 *
 * Reads the library's catalogue for what the shape supports, and the binding
 * for what is bound — neither alone is enough. Granularity needs a date on the
 * axis; a series control needs something making series.
 */
export function toolbarFor(type: WidgetTypeId, binding: ReportBinding) {
  const xDim = binding.x ? findDimension(binding.x) : undefined;
  const hasCategories = Boolean(binding.x);

  // Shapes whose reading would be destroyed by a top-N or a re-sort.
  const partOfWhole = type === 'donut';
  const aggregate = type === 'stat' || type === 'dial';
  const ordered = type === 'line' || type === 'area' || type === 'combo';

  return {
    granularity: Boolean(xDim?.granular),
    // Re-sorting a time axis puts months in the wrong order, and re-sorting a
    // donut repaints every slice — slot order is row order.
    sort: hasCategories && !aggregate && !ordered && !partOfWhole,
    // A top-N on a part-of-whole chart hides the remainder and the ring still
    // closes, which is a chart that lies about its own total.
    limit: hasCategories && !aggregate && !partOfWhole,
    series: Boolean(binding.breakdown) && (type === 'bar' || type === 'hbar'),
  };
}
