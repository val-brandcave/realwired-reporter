import type { WidgetTypeId } from '@realwired/ui';

import { ORG_COUNT } from '../data/orders';
import { EMPTY_BINDING, type ReportBinding } from './binding';

/* ============================================================================
   A report is a bound widget spec. A dashboard is an arrangement of them.

   ⭐ The move that collapses most of the product's complexity, from the plan:

       a REPORT    = { type, binding, options }
       a DASHBOARD = report references on a 12-column grid

   So "add a report to my dashboard", "build a new chart here" and "save what
   the copilot just drew" are one mechanism with three entry points, and
   nothing in the app renders a chart any other way.

   The consequence worth noticing: swapping a chart type is a one-field edit on
   a report, not a rebuild — which is the third thing the demo has to do
   live on the Sep-14 call.
   ========================================================================== */

export interface Report {
  id: string;
  /** What the reader calls it. Shown as the widget's title. */
  title: string;
  /** What the figure counts. Becomes the frame's definition tooltip. */
  hint: string;
  type: WidgetTypeId;
  binding: ReportBinding;
  /** Per-shape display options — stacking, orientation, a centre caption. */
  options?: Record<string, unknown>;
  /** What the widget counts, plural, for the coverage line. */
  noun?: string;
  /** Where it came from. `ai` gets a chip, so a generated report is never mistaken for a curated one. */
  origin: 'starter' | 'user' | 'ai';
  tags: string[];
}

const b = (patch: Partial<ReportBinding>): ReportBinding => ({ ...EMPTY_BINDING, ...patch });

/**
 * The starter library.
 *
 * Every one of these answers a question Reporter answers today, in its own
 * vocabulary — so a reader from Realwired recognises the widget even though
 * the arrangement is ours. That is the licence Ed gave on 8 Sept:
 * *"everything Reporter does, nothing Reporter is."*
 */
export const REPORTS: Report[] = [
  /* ---- single figures ---- */
  {
    id: 'r-client-fee',
    title: 'Total client fee',
    hint: 'Total billed to organizations for orders completed in the period. Includes pass-through costs; system fee is a subset of this, not an addition.',
    type: 'stat',
    binding: b({ y: [{ key: 'clientFee', agg: 'sum' }] }),
    options: { caption: `across ${ORG_COUNT} organizations` },
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue', 'kpi'],
  },
  {
    id: 'r-system-fee',
    title: 'System fee',
    hint: "Realwired's per-order share of the client fee. A subset of client fee, not an addition to it.",
    type: 'stat',
    binding: b({ y: [{ key: 'systemFee', agg: 'sum' }] }),
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue', 'kpi'],
  },
  {
    id: 'r-avg-turnaround',
    title: 'Average turnaround',
    hint: 'Calendar days from submission to completion, averaged across completed orders. Weekends and holidays included. Lower is better.',
    type: 'stat',
    binding: b({ y: [{ key: 'turnaroundDays', agg: 'avg' }] }),
    options: { compact: false },
    noun: 'completed orders',
    origin: 'starter',
    tags: ['operations', 'kpi'],
  },
  {
    id: 'r-completed-orders',
    title: 'Completed orders',
    hint: "Orders with a status of Complete whose completion date falls in the period.",
    type: 'stat',
    binding: b({ y: [{ key: 'orders', agg: 'count' }] }),
    noun: 'completed orders',
    origin: 'starter',
    tags: ['volume', 'kpi'],
  },

  /* ---- over time ---- */
  {
    id: 'r-order-activity',
    title: 'Order activity',
    hint: 'Orders submitted per period. Counts the submission date, so an order appears in the period it was placed rather than the one it was delivered in.',
    type: 'line',
    binding: b({
      x: 'submittedAt',
      y: [{ key: 'orders', agg: 'count' }],
      /* No granularity: AUTO. On the default period this is the difference
         between a flat two-point line and a five-point trend — see
         `autoGranularity`. It is the board's hero chart. */
    }),
    noun: 'orders',
    origin: 'starter',
    tags: ['volume', 'trend'],
  },
  {
    id: 'r-volume-by-category',
    title: 'Order volume by category',
    hint: 'Orders submitted per period, split by request category. Orders with no category assigned are shown as Unassigned rather than dropped — the note below says how many.',
    type: 'area',
    binding: b({
      x: 'submittedAt',
      y: [{ key: 'orders', agg: 'count' }],
      breakdown: 'requestCategory',
      /* AUTO — the x dimension is the date, so the range decides the band. */
    }),
    noun: 'orders',
    origin: 'starter',
    tags: ['volume', 'trend'],
  },
  {
    id: 'r-revenue-by-source',
    title: 'Revenue by source',
    hint: 'Client fee, system fee and pass-through per period, with the total across all three. Pass-through is billed on to the organization and is not revenue.',
    type: 'combo',
    binding: b({
      x: 'completedAt',
      y: [
        { key: 'systemFee', agg: 'sum' },
        { key: 'passThrough', agg: 'sum' },
      ],
      /* AUTO. */
    }),
    options: { totalLabel: 'Total billed' },
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue', 'trend'],
  },

  /* ---- comparison ---- */
  {
    id: 'r-fee-by-category',
    title: 'Client fee by category',
    hint: 'Total client fee by request category, for orders completed in the period.',
    type: 'bar',
    binding: b({
      x: 'requestCategory',
      y: [{ key: 'clientFee', agg: 'sum' }],
      sort: 'measure-desc',
    }),
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue'],
  },
  {
    id: 'r-top-orgs',
    title: 'Top organizations by fee',
    hint: 'Organizations ranked by total client fee over the period. Long names, so the bars lie down.',
    type: 'hbar',
    binding: b({
      x: 'org',
      y: [{ key: 'clientFee', agg: 'sum' }],
      sort: 'measure-desc',
      limit: 8,
    }),
    options: { showValues: true },
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue', 'clients'],
  },
  {
    id: 'r-turnaround-sla',
    title: 'Turnaround against SLA',
    hint: "Average calendar days to complete, by request category, against that category's SLA target. Identifies where actual turnaround exceeds the target.",
    type: 'target',
    binding: b({
      x: 'requestCategory',
      y: [{ key: 'turnaroundDays', agg: 'avg' }],
      targetOf: 'slaDays',
    }),
    options: { lowerIsBetter: true },
    noun: 'completed orders',
    origin: 'starter',
    tags: ['operations', 'sla'],
  },
  {
    id: 'r-fee-distribution',
    title: 'System fee per order',
    hint: 'Every completed order counted into a band by the system fee earned on it. The last band is open-ended.',
    type: 'distribution',
    binding: b({ y: [{ key: 'systemFee', agg: 'sum' }], bins: true }),
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue', 'distribution'],
  },
  {
    id: 'r-review-times',
    title: 'Average completion time',
    hint: 'Time from review initiation to completion, averaged by review type. Only completed reviews are included. Lower is faster.',
    type: 'durations',
    binding: b({
      x: 'reviewType',
      y: [{ key: 'reviewSeconds', agg: 'avg' }],
    }),
    options: { countNoun: 'reviews' },
    noun: 'AI reviews',
    origin: 'starter',
    tags: ['reviews', 'operations'],
  },

  /* ---- composition ---- */
  {
    id: 'r-category-mix',
    title: 'Fee by request category',
    hint: 'Share of total client fee by request category. Orders with no category are shown as their own Unassigned slice rather than dropped, so the total always reconciles — the note below says how many.',
    type: 'donut',
    binding: b({ x: 'requestCategory', y: [{ key: 'clientFee', agg: 'sum' }] }),
    options: { centerCaption: 'client fee' },
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue', 'mix'],
  },
  {
    id: 'r-status-mix',
    title: 'Orders by status',
    hint: 'Where every order in the period stands NOW — not where it stood during the period.',
    type: 'donut',
    binding: b({ x: 'status', y: [{ key: 'orders', agg: 'count' }] }),
    options: { centerCaption: 'orders' },
    noun: 'orders',
    origin: 'starter',
    tags: ['volume', 'mix'],
  },
  {
    id: 'r-utilization',
    title: 'Client utilization',
    hint: 'Orders submitted per organization per month. The pattern across a row is the finding; a fading row is a client trailing off.',
    type: 'heatmap',
    binding: b({
      x: 'org',
      y: [{ key: 'orders', agg: 'count' }],
      breakdown: 'submittedAt',
      /*
       * ⭐ PINNED, and the only report that is. Two reasons, and both are the
       * argument for why `granularity` stays overridable at all:
       *
       * The hint says "per organization per month". A binding that let the
       * range re-band it to weeks would have the sentence describing a chart
       * that is no longer there — and the sentence is what a client reads
       * aloud.
       *
       * And the date is in the BREAKDOWN here, not on the x axis, so the band
       * is this heatmap's column count rather than its trend resolution. A
       * matrix of 85 organizations by 5 weeks answers a different question
       * from one by 12 months, and the question is the report.
       */
      granularity: 'month',
      sort: 'measure-desc',
      limit: 8,
    }),
    noun: 'orders',
    origin: 'starter',
    tags: ['clients', 'trend'],
  },

  /* ---- detail ---- */
  {
    id: 'r-org-breakdown',
    title: 'Organization transactional breakdown',
    hint: 'Client fee is what the organization pays. System fee is Realwired’s share of it and is a subset. Pass-through is billed on and is not revenue.',
    type: 'table',
    binding: b({
      x: 'org',
      y: [
        { key: 'clientFee', agg: 'sum' },
        { key: 'systemFee', agg: 'sum' },
        { key: 'passThrough', agg: 'sum' },
      ],
      sort: 'measure-desc',
    }),
    options: { dimensionLabel: 'Organization', maxRows: 8 },
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue', 'detail'],
  },
  {
    id: 'r-category-table',
    title: 'Fee breakdown by category',
    hint: 'The same three fees, by request category rather than by organization.',
    type: 'table',
    binding: b({
      x: 'requestCategory',
      y: [
        { key: 'clientFee', agg: 'sum' },
        { key: 'systemFee', agg: 'sum' },
        { key: 'orders', agg: 'count' },
      ],
      sort: 'measure-desc',
    }),
    options: { dimensionLabel: 'Request category' },
    noun: 'completed orders',
    origin: 'starter',
    tags: ['revenue', 'detail'],
  },
];

export const findReport = (id: string): Report | undefined => REPORTS.find((r) => r.id === id);
