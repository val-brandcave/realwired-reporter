import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WidgetTypeId } from '@realwired/ui';
import {
  Button,
  Callout,
  DialViz,
  InsightBand,
  InsightCard,
  PageBody,
  PageHeader,
  tileSizePx,
  useToast,
  widgetSize,
} from '@realwired/ui';

import { useDashboardFilters } from '../components/DashboardFilters';
import { ReportWidget } from '../components/ReportWidget';
import { ORDERS } from '../data/orders';
import { bindingDateBasis, resolveBinding } from '../lib/binding';
import { addToDashboard } from '../lib/boards';
import { applyPeriod, applyValues, type Filters } from '../lib/context';
import { findDimension, type OrderRow } from '../lib/fields';
import { greeting, readInsights, type Finding } from '../lib/insights';
import { saveReport } from '../lib/library';

/* ============================================================================
   Insights — step 8, the last on PLAN.md §6's list.

   ⭐ It leads with COVERAGE, ahead of any chart, and that ordering is the
   approved artboard's rather than the plan's original proposal. The reasoning
   is the product's whole thesis in one screen: the diagnosis is that the data
   is not wrong, the maintenance was not done — so a reader who does not
   believe the numbers has no use for an interpretation of them. Band 1 answers
   "how much of the book is in here" before band 2 offers a reading of it.

   The brief for it: a dashboard always requires interpretation, so what it
   really holds are the questions a reader is already asking in their head. This
   screen answers two or three of them out loud.

   So the sentence is the content and the chart is its support. A dashboard
   puts the chart first and leaves the reading to the reader; reversing them is
   the entire difference between this screen and a board.

   ## What this file is, and what it is not

   ⭐ An ASSEMBLY. Every figure comes from `lib/insights.tsx`, which derives it
   from the rows in scope — not one number is typed in here or there. Every
   visible part is `@realwired/ui`'s: `InsightBand`, `InsightCard`, `StatCard`,
   `Callout`, and `ReportWidget` for the evidence. There is nothing product-
   local and visual in this file, which is rule 1.

   ## The evidence is a REAL widget, and the offers are real

   Each finding carries a `Report` — the same `{type, binding, options}` molecule
   a board stores and the builder writes — so `Pin to a dashboard` places the
   identical tile, and `Ask about this` hands the copilot a real question. The
   screen is a fourth author of widgets, not a fourth way to draw them.

   ## ⚠️ The date basis, which three surfaces have now got wrong first time

   Every widget here is scoped with `bindingDateBasis(binding)` unless the
   finding names its own — the same rule, and the same trap, as the builder and
   the copilot. Filtering completion while grouping submission spreads the rows
   over a wider window and draws a movement that never happened. TRAPS §3.
   ========================================================================== */

/** Read a dimension off a row by key. The value filter's accessor. */
function readDimension(row: OrderRow, key: string): string {
  const dim = findDimension(key);
  return dim ? dim.get(row, 'month') : '';
}

/**
 * What this screen lets you narrow by.
 *
 * Organization and segment, and deliberately not request category: every
 * finding on the screen is ABOUT the category mix — which one is past its SLA,
 * which one took the money with it — so filtering to one category would leave
 * the sentences technically true and useless. A filter that can only produce a
 * worse answer is a control that should not be offered.
 *
 * It is the same shared map every dashboard reads, so a reader who narrowed
 * Overview to one bank arrives here still narrowed to it. See `lib/context.ts`.
 */
const FIELDS = ['org', 'segment'] as const;

export interface InsightsPageProps {
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
}

export function InsightsPage({ filters, onFiltersChange }: InsightsPageProps) {
  const navigate = useNavigate();
  const toast = useToast();

  /*
   * The value filters, as a function.
   *
   * Handed to `readInsights` so the findings that reach outside the period —
   * the prior-period comparison, the SLA streak, the declining-volume rule —
   * narrow the same way the period rows did. Without it a screen filtered to
   * one organization would report on the whole book in band 3 while band 1
   * counted one client, which is a screen contradicting itself.
   */
  const narrow = useCallback(
    (rows: OrderRow[]) => applyValues(rows, filters.values, FIELDS, readDimension),
    [filters.values],
  );

  /*
   * ⚠️ `completedAt`, explicitly, and not the blended `'either'` default.
   *
   * Every sentence on this screen counts COMPLETED orders — "623 completed
   * orders", "average turnaround reached", "client fees fell". `'either'`
   * admits orders submitted in the period that have not completed, which for
   * August is 692 rows against 623: a prose figure and a coverage line one
   * inch apart, both true, disagreeing. The copilot hit exactly this and the
   * fix is the same one. TRAPS §3.
   */
  const rows = useMemo(
    () => narrow(applyPeriod(ORDERS, filters.range, 'completedAt')),
    [filters.range, narrow],
  );

  const read = useMemo(
    () => readInsights(rows, filters.range, narrow),
    [rows, filters.range, narrow],
  );

  const filterParts = useDashboardFilters({
    filters,
    onChange: onFiltersChange,
    fields: FIELDS,
    shipped: {},
    title: 'Filter insights',
    description:
      'Narrows every finding below. Filters stay with you on any dashboard that offers the same field.',
  });

  /* ---- what the offers under a finding actually do ---- */

  const pin = useCallback(
    (finding: Finding) => {
      if (!finding.report) return;
      saveReport(finding.report);
      /* Overview, for the same reason the copilot picks it: it is the board the
         demo opens on, and a chooser here would be a second decision in the
         middle of a first. The tile is removable and the board resets in one
         click. */
      addToDashboard('overview', finding.report.id);
      toast({
        tone: 'success',
        title: 'Added to Overview',
        description: `“${finding.report.title}” is on the board.`,
        action: { label: 'Open Overview', onClick: () => navigate('/dashboards/overview') },
      });
    },
    [toast, navigate],
  );

  /* The copilot already answers these, so the finding hands over the question
     rather than restating the answer in a second voice. */
  const ask = useCallback(() => navigate('/chat'), [navigate]);

  /**
   * Band 1's card — the figure BESIDE the sentence, not under it.
   *
   * ⭐ The artboard draws this differently from every other card on the screen
   * and the difference is the point: `Insights.dc.html` band 1 is
   * `flex-direction:row` with a 132px column holding a bare 132×82 arc and its
   * caption, and the paragraph filling the rest. There is no widget frame —
   * no title bar, no DEMO chip, no coverage footer.
   *
   * Rendered as an ordinary `attachment` it came out as a 934×400 framed
   * widget under the prose: a dial four hundred pixels tall whose own title
   * repeated the sentence above it, which is most of what made this screen
   * read as one item per row. MEASURED before the change — the three evidence
   * tiles were 934×400, 934×400 and 934×296.
   *
   * So this one card uses `DialViz` directly rather than `ReportWidget`. It is
   * still the registry's shape fed by the registry's resolver — the same
   * `r-classification-coverage` binding, resolved the same way — just without
   * the frame, which is the part the artboard omits. Nothing here draws a
   * chart the catalogue does not own.
   */
  const renderTrust = (finding: Finding) => {
    const report = finding.report;
    const range = finding.range ?? filters.range;
    const scoped = report
      ? narrow(applyPeriod(ORDERS, range, finding.basis ?? bindingDateBasis(report.binding)))
      : [];
    const dataset = report ? resolveBinding(report.binding, scoped, range).dataset : undefined;

    return (
      <InsightCard
        key={finding.id}
        tone={finding.tone}
        icon={finding.icon}
        title={finding.title}
        figure={
          dataset ? (
            /* 82px, the artboard's arc height. `fill` is deliberately OFF:
               outside a frame there is no definite-height parent for `h-full`
               to resolve against, and the shape would collapse to nothing. */
            <DialViz
              dataset={dataset}
              options={{ caption: 'of orders classified', height: 82 }}
            />
          ) : undefined
        }
        actions={
          <>
            {report && (
              <Button variant="outline" size="sm" iconLeft="add" onClick={() => pin(finding)}>
                Pin to Overview
              </Button>
            )}
            {finding.ask && (
              <Button variant="ghost" size="sm" iconLeft="comment" onClick={ask}>
                Ask about this
              </Button>
            )}
          </>
        }
      >
        {finding.prose}
      </InsightCard>
    );
  };

  /** One finding, with its evidence and its offers. */
  const render = (finding: Finding) => {
    const report = finding.report;
    /* The finding's own period where it names one — a twelve-month streak is
       not the page's period, and the widget's footer says which it drew. */
    const range = finding.range ?? filters.range;
    const scoped = report
      ? narrow(applyPeriod(ORDERS, range, finding.basis ?? bindingDateBasis(report.binding)))
      : [];

    return (
      <InsightCard
        key={finding.id}
        tone={finding.tone}
        icon={finding.icon}
        title={finding.title}
        attachment={
          report ? (
            /*
              ⚠️ BOTH halves, and the copilot shipped only one before this was
              understood. A tile's height comes from
              `.rw-grid .rw-tile > .rw-tile-card`, which is SCOPED TO THE GRID —
              so outside a grid the card sizes to its own content and the plot
              inside gets nothing. A sized box with no `h-full` on the card
              renders a void with a title at the top of it, which looks
              identical to the box having no height at all. TRAPS §6.

              And an inline style rather than `h-[260px]`: this app has NO
              Tailwind build, so an arbitrary value computes to 0 — or worse,
              resolves because a Storybook story in another repo happens to use
              that exact number. TRAPS §1.
            */
            <div style={{ height: evidenceHeight(report.type) }}>
              <ReportWidget
                className="rw-tile-card h-full"
                report={report}
                type={report.type}
                binding={report.binding}
                rows={scoped}
                allRows={scoped}
                range={range}
                partialPeriod={range.partial ? range.covered : undefined}
                fill
              />
            </div>
          ) : undefined
        }
        actions={
          <>
            {report && (
              <Button variant="outline" size="sm" iconLeft="add" onClick={() => pin(finding)}>
                Pin to Overview
              </Button>
            )}
            {finding.ask && (
              <Button variant="ghost" size="sm" iconLeft="comment" onClick={ask}>
                Ask about this
              </Button>
            )}
          </>
        }
      >
        {finding.prose}
      </InsightCard>
    );
  };

  return (
    <>
      {/*
        The same header band as every other screen — the filter button in the
        action row, the applied pills as a second row of the one band. The
        standing note from review: a surface should read as composed, not as
        elements that happen to be near each other.
      */}
      {/* No title — it is in the app header now (18 Sept). The band keeps what
          it is for: the filter control, and the line stating what is applied. */}
      <PageHeader actions={filterParts.button} toolbar={filterParts.summary} />

      <PageBody>
        <div
          className="rw-insight-column mx-auto flex w-full flex-col gap-6"
          style={{ maxWidth: COLUMN }}
        >
          <div>
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">
              {greeting()}, Brenda
            </h1>
            <p className="mt-1 text-md text-ink-2">
              {read.changed.length === 0
                ? 'Nothing moved enough to be worth a sentence'
                : read.changed.length === 1
                  ? 'One thing worth a minute'
                  : `${read.changed.length} things worth a minute`}
              , for {filters.range.label.toLowerCase()} across{' '}
              <span className="rw-numeric">{read.scope.orgs}</span> organizations and{' '}
              <span className="rw-numeric">{read.scope.rows.toLocaleString()}</span> completed
              orders.
            </p>
          </div>

          {/*
            The partial-period caveat, above everything it applies to — the same
            component and the same placement as the dashboards, because it is
            the same fact. A to-date period compared against a full previous one
            is the audit's highest-severity finding, and the whole of band 2 is
            period-over-period comparison.
          */}
          {filters.range.partial && (
            <Callout tone="warning">
              <span className="rw-numeric font-semibold">{filters.range.covered}</span> so far.
              Every comparison below is against a period that has not finished, so it is not like
              for like. Pick <strong className="font-semibold">Previous billing cycle</strong> or{' '}
              <strong className="font-semibold">Last month</strong> for a closed period.
            </Callout>
          )}

          {/* ⭐ BAND 1 FIRST, deliberately. Trust before interpretation. */}
          <InsightBand label="What you can trust">{renderTrust(read.coverage)}</InsightBand>

          {/*
            An empty band is NOT rendered — no heading over a blank space. A
            period where nothing moved enough to say is a real answer, and the
            lead sentence above has already given it.
          */}
          {read.changed.length > 0 && (
            <InsightBand label={`What changed in ${filters.range.label.toLowerCase()}`}>
              {/*
                ⭐ TWO-UP, as the artboard draws it — restored 11 Sept, and the
                departure it replaces is worth keeping a record of because the
                reasoning was sound and the conclusion was still wrong.

                This was one column from the day it shipped, on a measurement:
                at two-up a card was 436px, which wrapped every category label
                in the SLA chart onto two lines, so its plot needed 494px in a
                400px box and drew THREE of six categories. All true. What it
                missed is that 436 was not a fact about two-up — it was a fact
                about a two-up row inside a 980px reading column. The cap was
                the cause, and the one-column band was a workaround for it.

                At COLUMN 1240 the same card is 612px, the labels sit on one
                line, and all six categories draw. So the fix was to widen the
                page rather than to stack the band.

                `InsightCard` was built for this arrangement — `h-full` and the
                `mt-auto` footer rule exist so two findings in a row end level,
                and neither does anything in a single column.
              */}
              <div className="rw-insight-pair">{read.changed.map(render)}</div>
            </InsightBand>
          )}

          {read.watch.length > 0 && (
            <InsightBand
              label="What to look at"
              hint="Each of these is a list rather than a measure — the count is how long the list is."
            >
              {/*
                ⚠️ `InsightCard`, not `StatCard`, and that was the second
                attempt. StatCard's caption is `white-space: nowrap` with an
                ellipsis — MEASURED, 836px of sentence in a 270px box, so every
                one of these was cut to "Completed volume down in each of the
                last tw…". Its caption slot is for "vs. last month", which is
                what its own documentation says. A count whose explanation has
                been truncated is a number with no meaning attached, which is
                precisely what this band exists to avoid.
              */}
              <div className="rw-insight-trio">
                {read.watch.map((item) => (
                  <InsightCard
                    key={item.id}
                    tone={item.tone}
                    icon={item.icon}
                    title={
                      <>
                        <span className="rw-numeric text-xl">{item.value}</span>{' '}
                        {item.label}
                      </>
                    }
                  >
                    {item.caption}
                  </InsightCard>
                ))}
              </div>
            </InsightBand>
          )}

          {/*
            Said once, at the bottom, where a reader who has read the screen
            arrives — not as a banner they scroll past before there is anything
            to be sceptical about. It is the same admission the copilot makes
            under its composer, and for the same reason: a surface that draws
            conclusions has to say how it drew them.
          */}
          <p className="text-sm text-ink-3">
            Every finding here is computed from the orders in scope — the figures move when the
            filters do. The wording is ours; the numbers are the data&rsquo;s.
          </p>
        </div>
      </PageBody>

      {filterParts.dialog}
    </>
  );
}

/*
 * ⚠️ Inline style values, not Tailwind arbitrary values. THIS APP HAS NO
 * TAILWIND BUILD — `max-w-[980px]` computes to 0, and the one arbitrary value
 * that did work in `ChatPage` only worked because a story file in another repo
 * used that exact number. A pixel value goes where it cannot evaporate.
 * TRAPS §1.
 */

/**
 * The reading measure.
 *
 * ⭐ 1240, raised from 980 on 11 Sept, and the old number was the cause of the
 * screen's worst layout defect rather than a taste call.
 *
 * MEASURED from `Insights.dc.html`: canvas 1440, rail 236, page padding 32 a
 * side — so the artboard's bands are 1140px wide and the page is not centred
 * in a column at all. At 980 a two-up card was 436px, which is what forced
 * band 2 into one column; every band then read as one item per row down the
 * middle of a 1696px content area, with 716px of it unused.
 *
 * Still capped, because the cap is doing a second job the artboard never had
 * to think about: it was drawn at 1440 and we render on whatever monitor is in
 * the room. Band 1's paragraph runs the full width of its column, and prose
 * set to 1696px is unreadable regardless of how much room there is.
 *
 * At 1240 a two-up card is 612px, which is the width at which the SLA target
 * chart stops wrapping its category labels — the measurement that forced the
 * one-column departure in the first place. See the note in band 2.
 */
const COLUMN = 1240;

/**
 * The evidence widget's height — the one a BOARD would give it.
 *
 * ⭐ Read off `widgetSize(type).def` and `tileSizePx`, which are the grid's own
 * geometry, published by the library for exactly this reason: the builder makes
 * the same claim about its preview, and a height copied into this file would be
 * a second source of truth for how tall a widget needs to be.
 *
 * ⚠️ And it is not cosmetic. MEASURED at a flat 240px for every shape, which
 * was the first attempt: the SLA target chart drew its first of six rows and
 * CLIPPED the rest, and the ranked organization chart printed ten labels on top
 * of one another — a stack of overlapping bank names where a legible axis
 * should be. A shape rendered below its declared minimum does not shrink, it
 * breaks, and both of those looked like rendering bugs rather than a box being
 * too short.
 *
 * A dial wants 192, a ranked bar 296, an actual-vs-target 400 — which is the
 * shape saying how much room its own reading needs.
 */
function evidenceHeight(type: WidgetTypeId): number {
  const [w, h] = widgetSize(type).def;
  return tileSizePx(w, h, COLUMN).height;
}
