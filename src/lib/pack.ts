import { widgetSize, type TilePlacement, type WidgetTypeId } from '@realwired/ui';

import type { Report } from './reports';

/* ============================================================================
   The packer — turning chosen widgets into a board that reads like one.

   ⭐ This file exists because `addToDashboard` is the wrong tool for five
   widgets at once, and the way it is wrong is invisible until you look.

   `addToDashboard` places ONE report: `x: 0`, the shape's catalogue width, on
   the first free row. That is exactly right for its job — a widget added from
   the builder or the copilot lands at the bottom where the reader can find it.
   Run five through it and you get five full-width bands stacked down the page:
   four stat cards each occupying a row of twelve columns, each drawing one
   number in a box built for a chart. It typechecks, it renders, and it is not
   a dashboard. That is this project's failure mode stated exactly.

   So a composed board is packed by SHAPE, the way the five shipped boards are.

   ## The rule, taken from the boards we already ship

   Read `DASHBOARDS` in `lib/dashboards.ts` and every one of them does the same
   three things:

     1. figures across the top, in one row
     2. charts below, two to a row
     3. tables last, full width

   Overview is four stats at w:3, then an 8/4 split, then 6/6, then a 12-wide
   table. Transactions is two stats, a chart, a 6/6 pair, then a 12-wide table.
   The composed board follows the same grammar, because a board that arrived by
   a different route should not be recognisable as having arrived by a
   different route.

   ## ⚠️ And the floor that is not optional

   `widgetSize(type).def` is the catalogue's default, and TRAPS §4.x is the
   record of what happens when a placement goes under it: the Overview target
   chart was shipped at h:3 against a default of 4 and drew **four of six
   categories**, silently, on the board the demo opens with. Nothing errored.
   Six were in the DOM and four were on screen.

   Every height here is therefore taken FROM the catalogue rather than written
   down, and widths never go below the catalogue width. The packer may make a
   tile bigger than its default. It may never make one smaller.
   ========================================================================== */

/** The grid the dashboards are drawn on. Twelve, everywhere. */
const COLS = 12;

/**
 * Shapes that are a single figure rather than a plot.
 *
 * Derived from the catalogue where it can be — a `stat` is the one shape whose
 * default width is a quarter of the grid — but named explicitly because the
 * distinction being made is editorial, not geometric: these are the things a
 * reader scans first, and they belong in one band at the top whatever the
 * catalogue says about their size.
 */
const FIGURE_SHAPES: WidgetTypeId[] = ['stat', 'dial'];

/** Shapes that are a body of rows, and want the full width to show them. */
const TABLE_SHAPES: WidgetTypeId[] = ['table'];

const isFigure = (t: WidgetTypeId) => FIGURE_SHAPES.includes(t);
const isTable = (t: WidgetTypeId) => TABLE_SHAPES.includes(t);

/**
 * The width a row of figures gives each one.
 *
 * ⭐ Even distribution across the twelve, floored at the catalogue width.
 * Three stats become w:4 and fill the row; four become w:3, which is exactly
 * what Overview ships. Two become w:6 rather than two quarter-tiles marooned
 * beside six columns of nothing.
 *
 * ⚠️ Five or more would divide to w:2, under `stat`'s catalogue w:3 — so the
 * floor applies and the row wraps instead. A stat tile below its default width
 * is where `$751.02K` gets clipped (TRAPS §4), and a tidy row is not worth a
 * clipped headline figure.
 */
function figureWidth(count: number, min: number): number {
  return Math.max(min, Math.floor(COLS / Math.max(1, count)));
}

/**
 * Lay chosen reports out as a dashboard.
 *
 * Returns placements in the order the grid should hold them. Pure — no store
 * writes, no side effects — so it can be reasoned about and, when there is a
 * test harness here, tested without mounting anything.
 */
export function packBoard(reports: Report[]): TilePlacement[] {
  const figures = reports.filter((r) => isFigure(r.type));
  const tables = reports.filter((r) => isTable(r.type));
  const charts = reports.filter((r) => !isFigure(r.type) && !isTable(r.type));

  const out: TilePlacement[] = [];
  let y = 0;

  /* ---- 1 · the figures, across the top ---- */
  if (figures.length) {
    /* One width for the whole band, from the WIDEST catalogue minimum in it,
       so the row is even. A band of tiles at three different widths reads as a
       layout that got away from someone. */
    const minW = Math.max(...figures.map((r) => widgetSize(r.type).def[0]));
    const w = figureWidth(figures.length, minW);
    /* Likewise one height, the tallest default in the band — a short tile
       beside a tall one leaves a notch in the top edge of the board. */
    const h = Math.max(...figures.map((r) => widgetSize(r.type).def[1]));

    let x = 0;
    for (const r of figures) {
      /* Wrap when the next tile would run past the grid. The grid compacts
         upward, so a wrapped row needs no special handling beyond the y. */
      if (x + w > COLS) {
        x = 0;
        y += h;
      }
      out.push({ id: r.id, x, y, w, h });
      x += w;
    }
    y += h;
  }

  /* ---- 2 · the charts, two to a row ---- */
  for (let i = 0; i < charts.length; i += 2) {
    const pair = charts.slice(i, i + 2);

    if (pair.length === 2) {
      /* Half each, unless a shape's catalogue width will not fit in six — in
         which case it takes the row on its own rather than being squeezed
         under its own default. */
      const [a, b] = pair;
      const aMin = widgetSize(a.type).def[0];
      const bMin = widgetSize(b.type).def[0];

      if (aMin <= COLS / 2 && bMin <= COLS / 2) {
        const h = Math.max(widgetSize(a.type).def[1], widgetSize(b.type).def[1]);
        out.push({ id: a.id, x: 0, y, w: COLS / 2, h });
        out.push({ id: b.id, x: COLS / 2, y, w: COLS / 2, h });
        y += h;
        continue;
      }

      /* One of them is wider than half the grid. Stack them full width. */
      for (const r of pair) {
        const h = widgetSize(r.type).def[1];
        out.push({ id: r.id, x: 0, y, w: COLS, h });
        y += h;
      }
      continue;
    }

    /* An odd chart at the end takes the full width rather than sitting at half
       beside empty space. A lone half-width tile with six columns of nothing
       next to it is the clearest sign a board was generated. */
    const [only] = pair;
    const h = widgetSize(only.type).def[1];
    out.push({ id: only.id, x: 0, y, w: COLS, h });
    y += h;
  }

  /* ---- 3 · the tables, full width, last ---- */
  for (const r of tables) {
    /*
     * ⚠️ The catalogue height, not a number chosen here. `table`'s `def` was
     * `[12, 4]` until 15 Sept, which gave a 241px body holding 504px of rows
     * with `overflow: hidden` — every table on every board was amputated, and
     * the clipped region held the totals row and the "Showing 8 of 79 rows"
     * footer. It is `[12, 7]` now. Reading it from the catalogue is what makes
     * that fix reach a board this file builds.
     */
    const [w, h] = widgetSize(r.type).def;
    out.push({ id: r.id, x: 0, y, w: Math.max(w, COLS), h });
    y += h;
  }

  return out;
}
