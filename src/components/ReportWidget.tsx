import { useMemo, type ReactNode } from 'react';
import {
  ChartToolbar,
  TargetLegend,
  Widget,
  WidgetFrame,
  datasetLegend,
  resolveCategories,
  type WidgetTypeId,
} from '@realwired/ui';

import {
  BAND_NOUN,
  bindingCoverage,
  classificationGap,
  edgeClips,
  resolveBinding,
  suggest,
  toolbarFor,
  type ReportBinding,
} from '../lib/binding';
import type { Granularity } from '../lib/fields';
import type { OrderRow } from '../lib/fields';
import type { Report } from '../lib/reports';

export interface ReportWidgetProps {
  report: Report;
  /** Rows already narrowed by the global context and the dashboard's scope. */
  rows: OrderRow[];
  /** The whole book, so coverage can report what the widget left out. */
  allRows: OrderRow[];
  /**
   * The active period.
   *
   * Not for filtering — the caller has already done that — but for
   * AUTO-GRANULARITY: a date dimension bands itself from the range's length so
   * a short period does not draw a two-point trend. See `autoGranularity`.
   * Omit and a binding with no pinned granularity falls back to monthly.
   */
  range?: { from: string; to: string };
  /** Set when the selected date range ends today. Strips a delta's colour. */
  partialPeriod?: string;
  /**
   * Also show the partial-period CHIP in the widget's header.
   *
   * On by default, and a dashboard turns it OFF. On a board of nine widgets
   * the chip is printed nine times for one fact the filter row already
   * states once, at the top, in a full sentence — and measured on screen it
   * pushed every stat card's title into an ellipsis ("Completed…", "Total
   * client …"), which trades a readable title for a redundant label.
   *
   * The functional half of the flag is unaffected: `partialPeriod` still
   * reaches the shape through `options`, where it strips the delta's colour.
   * That is the part that stops the widget making a claim it cannot support,
   * and it is never suppressed.
   */
  showPartialChip?: boolean;
  /** The tile menu, or a report-library action. */
  actions?: ReactNode;
  /** Size the plot to the cell. What a dashboard tile passes. */
  fill?: boolean;
  /** Overrides the saved binding — what the toolbar edits. */
  binding?: ReportBinding;
  /** Overrides the saved shape — what "change chart type" edits. */
  type?: WidgetTypeId;
  /**
   * Show the display controls in the frame's toolbar slot.
   *
   * Off by default. A board in READING mode should carry no controls at all —
   * nine toolbars is nine invitations to fiddle with a dashboard somebody
   * already composed. Edit mode turns them on, which is also what makes the
   * mode visible without a banner announcing it.
   */
  editing?: boolean;
  /** Swap the shape. Wired to the toolbar's segmented control. */
  onTypeChange?: (id: WidgetTypeId) => void;
  /**
   * Pin the date band, or hand back `undefined` to return to auto.
   *
   * `undefined` is the auto state rather than a separate flag, because that is
   * exactly what it means on the binding — see `ReportBinding.granularity`.
   */
  onGranularityChange?: (g: Granularity | undefined) => void;
  className?: string;
}

/**
 * One report, resolved and rendered.
 *
 * ⭐ The single place this app turns a spec into a chart. A dashboard tile, the
 * report library's preview, the builder's live preview and — later — a chart
 * inside a chat message all go through here, which is what keeps them
 * identical as shapes are added.
 *
 * It does three things and nothing else: resolve the binding against the rows,
 * choose the legend the shape needs, and compute the coverage line. Everything
 * visual belongs to `WidgetFrame` and the shape.
 *
 * ## The legend is the shape's business, not the caller's
 *
 * A caller should not have to remember that `target` wants a status legend and
 * `donut` wants none because its own value list names the slices. Getting that
 * wrong produces either an unlabelled multi-series chart or the same nine rows
 * printed twice, and both looked like rendering bugs when they happened. So
 * the mapping lives here, once.
 */
export function ReportWidget({
  report,
  rows,
  allRows,
  range,
  partialPeriod,
  showPartialChip = true,
  actions,
  fill,
  binding,
  type,
  editing,
  onTypeChange,
  onGranularityChange,
  className,
}: ReportWidgetProps) {
  const shape = type ?? report.type;
  const spec = binding ?? report.binding;

  const resolved = useMemo(() => resolveBinding(spec, rows, range), [spec, rows, range]);

  const legend = useMemo(() => {
    if (shape === 'target') {
      return <TargetLegend lowerIsBetter targetLabel="SLA" />;
    }
    /*
     * A donut with its value list on gets NO legend row: the list already
     * names every slice and carries its figure, so a legend beside it is the
     * same rows twice, once with numbers and once without.
     */
    if (shape === 'donut') return undefined;
    if (shape === 'heatmap') return undefined;
    // One series is named by the title. Two or more is a contract requirement.
    if (resolved.dataset.series.length < 2) return undefined;
    return datasetLegend(resolved.dataset);
  }, [shape, resolved.dataset]);

  /*
   * The display controls, computed from the binding.
   *
   * `toolbarFor` decides which controls this binding can honestly offer and
   * `suggest` decides which shapes could draw it — both live in the app,
   * because both are questions about a Reporter binding. The library only
   * knows how to draw the row. That split is the same one the whole product
   * rests on: the shapes are closed and generic, the questions are not.
   */
  const toolbar = useMemo(() => {
    if (!editing) return undefined;

    const plan = toolbarFor(type ?? report.type, binding ?? report.binding);
    const alternatives = suggest(binding ?? report.binding, resolved.series).map((d) => d.id);

    /*
     * ⚠️ `cycle` has no segment, so a widget banded by cycle carries NO
     * granularity control at all.
     *
     * The library's control is day / week / month — Reporter's 16th-to-15th
     * billing cycle is not one of them, and it is the app's own period rather
     * than a shape's concern. Rendering the control anyway would sit its thumb
     * on `Month` while the chart drew cycles: a control describing something
     * other than what is on screen, which is the same defect class as a
     * coverage line contradicting the slice beside it.
     *
     * Absent, not disabled — the doctrine for every other control in this row.
     * A cycle-banded report is changed in the builder.
     */
    const banded = resolved.granularity === 'cycle' ? { ...plan, granularity: false } : plan;

    return (
      <ChartToolbar
        plan={banded}
        type={type ?? report.type}
        alternatives={alternatives}
        onTypeChange={onTypeChange}
        /*
         * The control shows what is DRAWN, not what is saved.
         *
         * `spec.granularity` is undefined on an auto binding, so the segment
         * sits on `Auto` and the group's label names the band auto landed on —
         * `resolved.granularity`, read off the resolver rather than
         * recomputed, so the control and the chart cannot disagree.
         */
        granularity={spec.granularity === 'cycle' ? 'auto' : (spec.granularity ?? 'auto')}
        resolvedGranularity={
          resolved.granularity === 'cycle' ? undefined : resolved.granularity
        }
        onGranularityChange={
          onGranularityChange
            ? (g) => onGranularityChange(g === 'auto' ? undefined : g)
            : undefined
        }
      />
    );
  }, [
    editing,
    type,
    report.type,
    report.binding,
    binding,
    spec.granularity,
    resolved.series,
    resolved.granularity,
    onTypeChange,
    onGranularityChange,
  ]);

  const coverage = useMemo(
    () => bindingCoverage(resolved, allRows, report.noun ?? 'orders'),
    [resolved, allRows, report.noun]
  );

  /*
   * The fold, disclosed.
   *
   * A donut of 83 organizations folds 76 of them into "Other" and the ring
   * still closes — which is correct, and silent. Saying how many went in is
   * what stops the reader concluding the business has eight clients.
   */
  const note = useMemo(() => {
    const parts: string[] = [];

    /*
     * ⭐ The classification gap, stated.
     *
     * Rows with nothing in the grouping dimension are bucketed as `Unassigned`
     * rather than dropped, so no money goes silently missing — which means the
     * coverage line above correctly reads 100% and says nothing useful. Without
     * this sentence the reader sees "100%" beside an "Unassigned" slice and is
     * left to reconcile two true statements on their own.
     *
     * Saying it converts the contradiction into the maintenance task the 8 Sept
     * call identified as the real cause of "the data is wrong".
     */
    const gap = classificationGap(resolved);
    if (gap) {
      const pct = gap.share < 0.001 ? '<0.1%' : `${(gap.share * 100).toFixed(1)}%`;
      parts.push(
        `${gap.count.toLocaleString()} ${gap.count === 1 ? 'order has' : 'orders have'} no ` +
          `${gap.label} (${pct}) and ${gap.count === 1 ? 'is' : 'are'} shown as Unassigned` +
          (gap.fee > 0
            ? `, carrying $${Math.round(gap.fee).toLocaleString()} of system fee.`
            : '.')
      );
    }

    /*
     * ⭐ The clipped end bands, stated — BEFORE the fold, because it is the
     * one that changes how the chart's SHAPE is read.
     *
     * A range rarely starts on a Monday, so the first and last bands of a
     * trend hold fewer days than the ones between them and the line draws the
     * shortfall as a movement. Measured on the default period, the hero
     * chart's opening point sat at 55% of the interior average — a fall that
     * is entirely an artefact of the band being four days long. See
     * `edgeClips` for the numbers and for why the answer is to say it rather
     * than to drop the rows or move the period.
     */
    const clips = edgeClips(spec, range, resolved.granularity);
    if (clips.length) {
      const noun = BAND_NOUN[resolved.granularity];
      const parts_ = clips.map(
        (c) => `the ${c.edge} covers ${c.covered} of ${c.length} days`
      );
      parts.push(
        `The period starts and ends mid-${noun}, so ` +
          `${parts_.join(' and ')} — ${clips.length === 1 ? 'that point sits' : 'those points sit'} ` +
          `below a full ${noun} rather than showing a fall.`
      );
    }

    if (shape === 'donut') {
      const { foldedCount } = resolveCategories(resolved.dataset);
      if (foldedCount > 0) {
        parts.push(
          `The ${foldedCount} smallest are grouped into Other, and their values are included in it.`
        );
      }
    }

    return parts.length ? parts.join(' ') : undefined;
  }, [shape, resolved, spec, range]);

  const empty = resolved.dataset.data.length === 0 || resolved.scoped.length === 0;

  return (
    <WidgetFrame
      className={className}
      title={report.title}
      hint={report.hint}
      /* Always. Every figure in this prototype is invented, and unlabelled
         demo data in front of a client costs hours arguing about a number
         that was never real. */
      demo
      partialPeriod={showPartialChip ? partialPeriod : undefined}
      legend={legend}
      toolbar={toolbar}
      actions={actions}
      coverage={empty ? undefined : coverage}
      note={note}
      empty={empty}
      emptyTitle="No orders in this period"
      emptyDescription="Widen the period, or clear a filter — the row under the title says what narrowed it."
    >
      <Widget
        type={shape}
        dataset={resolved.dataset}
        options={{
          ...report.options,
          fill,
          /* The partial-period flag reaches the stat card through options,
             where it does more than annotate: it strips the delta's colour.
             The frame's chip is the other half of the same fact. */
          ...(partialPeriod ? { partialPeriod } : {}),
        }}
      />
    </WidgetFrame>
  );
}
