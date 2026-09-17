import { useSyncExternalStore } from 'react';

import type { TilePlacement } from '@realwired/ui';

/* ============================================================================
   Dashboards.

   Reporter's six tabs are a FIXED set of FIXED dashboards. These are an
   extensible set of composable ones — which is not a bigger version of
   Reporter, it is a different kind of object, and every good idea in the plan
   follows from it. The five we ship and the one made live on the call are
   the same kind of thing, created the same way.

   A dashboard is: a name, a scope, and an arrangement of report references.
   Nothing more. That is what makes "+ New dashboard" a real feature rather
   than a promise.
   ========================================================================== */

export interface Dashboard {
  id: string;
  name: string;
  /**
   * One line about the board, for anyone reading this file.
   *
   * ⚠️ NOT rendered. It was the description under the page title and Val cut
   * it on 10 Sept — a board named `Transactions` carrying a sentence that says
   * it is about transactions is a line the eye learns to skip, and it was
   * costing the header a row. Kept here because it is the clearest statement
   * of what each board is FOR, which is what a reader of this list needs.
   */
  blurb: string;

  /**
   * The value filters this dashboard's modal offers, in the order they read.
   *
   * ⭐ Val's call, 10 Sept: each dashboard has its own set of filters. This is
   * that set, and it is load-bearing in a second way — `applyValues` narrows
   * by these keys and nothing else, so a value the reader set on another board
   * for a field this one does not offer is not quietly in force here. See the
   * shared-map note in `lib/context.ts`.
   *
   * Two fields are deliberately absent everywhere. Dates: the period IS the
   * date filter, and offering a second one would be two controls for one
   * question. `state`: 51 values, and no board's question is "which states".
   */
  filters: readonly string[];

  /**
   * The filter values this dashboard SHIPS with — its own default scope,
   * because it is part of what the board means (Transactions counts billed
   * work, so it ships filtered to `Complete`).
   *
   * A reader's own choice for the same field wins over this, and clearing it
   * clears back to nothing rather than back to the default. That is the
   * honest reading of `Clear all`: it says all.
   */
  scope: Record<string, string[]>;
  tiles: TilePlacement[];
}

/**
 * The fields most boards offer — who, what kind of work, and where it got to.
 *
 * Named rather than repeated so a board's own list says only what is DIFFERENT
 * about that board, which is the only part worth reading.
 */
const COMMON_FILTERS = ['org', 'requestCategory', 'status'] as const;

/**
 * The five boards.
 *
 * ⭐ Two renames from Reporter's own tabs, both deliberate:
 *
 * `Client Insights` → **Client Portfolio.** Reporter's tab is named for
 * clients and was built for Realwired — the single clearest instance of the
 * audience confusion the 2 Sept call identified. With the customer view cut,
 * the honest name is the internal one, and it frees the word *Insights* for
 * the nav item that actually narrates.
 *
 * `Realwired Ledger` keeps its name. It is the vendor's own P&L rather than
 * the operational picture the other boards give, and whether it belongs in the
 * demo at all is still an open question — so it ships, cheaply, and can be
 * dropped without touching anything else.
 */
export const DASHBOARDS: Dashboard[] = [
  {
    id: 'overview',
    name: 'Overview',
    blurb: 'Volume, revenue and turnaround across the whole book.',
    /* The whole book, so the whole common set plus the client's own tier. */
    filters: [...COMMON_FILTERS, 'segment'],
    scope: {},
    tiles: [
      /*
       * ⚠️ h:3, not h:2 — MEASURED 17 Sept. `Total client fee` carries the
       * caption "across 85 organizations", so its content is 59px; at h:2 the
       * plot area is 45px once the provenance footer has taken its space, and
       * the caption was sliced. The other three have no caption and fitted,
       * which is how this survived: one tile in four was wrong, and only the
       * one whose figure had something extra to say.
       *
       * The whole band moves together — a row of stats at two different
       * heights leaves a notch in the top edge of the board. `stat`'s
       * catalogue default is [3, 3]; these now follow it. See TRAPS §4.x.
       */
      { id: 'r-completed-orders', x: 0, y: 0, w: 3, h: 3 },
      { id: 'r-client-fee', x: 3, y: 0, w: 3, h: 3 },
      { id: 'r-avg-turnaround', x: 6, y: 0, w: 3, h: 3 },
      { id: 'r-system-fee', x: 9, y: 0, w: 3, h: 3 },
      { id: 'r-order-activity', x: 0, y: 3, w: 8, h: 3 },
      { id: 'r-category-mix', x: 8, y: 3, w: 4, h: 3 },
      /*
       * ⚠️ FOUR rows, not three, and it was three until 2026-09-11.
       *
       * MEASURED on this board: at h:3 the target chart's plot box was 122px
       * holding 214px — `Review` and `Inspection` were **not drawn at all**,
       * silently, on the board the demo opens with. Six categories were in the
       * DOM and four were on screen. Nothing errored and the chart looked
       * finished, which is this project's whole failure mode.
       *
       * `target`'s catalogue default is [6,4]; this tile was shipped below it.
       * A placement narrower or shorter than a shape's own default is a
       * promise the shape did not make — check `widgetSize(type).def` before
       * writing one by hand.
       *
       * FIVE rather than the catalogue's four, and the extra row is measured
       * too: at 6 columns the tile is 609px wide, which wraps "Commercial
       * appraisal" and "Residential appraisal" onto two lines, and seven rows
       * of that (six categories plus Unassigned) ran 6px past the box — enough
       * to slice the `0d`/`32d` axis labels in half. A target chart's height
       * scales with its category COUNT and with whether its labels wrap, which
       * a single default pair cannot express; when a shape's rows are
       * data-driven, measure the tile rather than trusting `def`.
       */
      { id: 'r-turnaround-sla', x: 0, y: 6, w: 6, h: 5 },
      { id: 'r-status-mix', x: 6, y: 6, w: 6, h: 5 },
      { id: 'r-org-breakdown', x: 0, y: 11, w: 12, h: 8 },
    ],
  },
  {
    id: 'transactions',
    name: 'Transactions',
    blurb: 'What was billed, to whom, and how it splits.',
    /* Billing, so `orderType` earns its place: a rush order bills
       differently, and this is the only board where that is the question. */
    filters: [...COMMON_FILTERS, 'segment', 'orderType'],
    scope: { status: ['Complete'] },
    /*
     * ⚠️ The two stats are h:3, not h:2, and the rows below moved with them.
     *
     * MEASURED 17 Sept: at h:2 `Total client fee` held 59px of content in a
     * 45px plot and its caption was sliced. This board scopes to `Complete`,
     * so every widget carries a coverage GAP and therefore a two-line
     * provenance footer — which is exactly the case `stat`'s old `def: [3, 2]`
     * could not draw. The catalogue default is [3, 3] now; these placements
     * follow it rather than sitting under it. See TRAPS §4.x.
     */
    tiles: [
      { id: 'r-client-fee', x: 0, y: 0, w: 3, h: 3 },
      { id: 'r-system-fee', x: 3, y: 0, w: 3, h: 3 },
      { id: 'r-fee-by-category', x: 6, y: 0, w: 6, h: 3 },
      { id: 'r-top-orgs', x: 0, y: 3, w: 6, h: 4 },
      { id: 'r-fee-distribution', x: 6, y: 3, w: 6, h: 3 },
      { id: 'r-category-table', x: 0, y: 7, w: 12, h: 7 },
    ],
  },
  {
    id: 'ledger',
    name: 'Realwired Ledger',
    blurb: "Realwired's own revenue, by source and over time.",
    /* Realwired's own P&L. No `segment` — the client's tier is a fact about
       the client, and this board is not asking about the client. */
    filters: [...COMMON_FILTERS],
    scope: { status: ['Complete'] },
    tiles: [
      /* h:3 — the catalogue default, and this board scopes to `Complete` so
         its footers run to two lines. See the note on Transactions. */
      { id: 'r-system-fee', x: 0, y: 0, w: 4, h: 3 },
      { id: 'r-revenue-by-source', x: 4, y: 0, w: 8, h: 3 },
      { id: 'r-fee-distribution', x: 0, y: 3, w: 4, h: 3 },
      { id: 'r-org-breakdown', x: 0, y: 6, w: 12, h: 8 },
    ],
  },
  {
    id: 'portfolio',
    name: 'Client Portfolio',
    blurb: 'Who is growing, who is trailing off, and who to call.',
    /* A board about clients: tier matters, and the category mix is how you
       tell a growing account from a busy one. */
    filters: [...COMMON_FILTERS, 'segment'],
    scope: {},
    tiles: [
      { id: 'r-top-orgs', x: 0, y: 0, w: 6, h: 4 },
      { id: 'r-utilization', x: 6, y: 0, w: 6, h: 4 },
      { id: 'r-org-breakdown', x: 0, y: 4, w: 12, h: 8 },
    ],
  },
  {
    id: 'reviews',
    name: 'AI Reviews',
    blurb: 'Review volume, mix and how long they take.',
    /* `reviewType` exists for exactly this board, and is offered nowhere
       else — which is the case that per-board sets were asked for. */
    filters: ['org', 'reviewType', 'requestCategory', 'status'],
    scope: {},
    tiles: [
      { id: 'r-review-times', x: 0, y: 0, w: 5, h: 3 },
      { id: 'r-order-activity', x: 5, y: 0, w: 7, h: 3 },
      { id: 'r-category-table', x: 0, y: 3, w: 12, h: 7 },
    ],
  },
];

/* ============================================================================
   The boards the user makes.

   ⭐ `DASHBOARDS` above is the five we SHIP. This is the extensible half, and
   between them they are the claim this file opens with — that a dashboard is a
   name, a scope and an arrangement, so the one made live on a call is the same
   kind of object as the five that ship, created the same way and reachable by
   the same route.

   The shape is `lib/boards.ts`'s, deliberately: one `useSyncExternalStore`
   over a module-level value. A board's ARRANGEMENT lives there and a board's
   IDENTITY lives here, and the split is the same one the type draws — a user
   rearranging `Overview` has not made a new dashboard.

   Session-scoped, like every other edit in the prototype. Reload restores the
   five. Nothing above this line changes when it becomes durable.
   ========================================================================== */

let userBoards: Dashboard[] = [];

const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/* The snapshot must be REFERENTIALLY STABLE between emits — `useSyncExternalStore`
   re-reads it on every render and loops forever on a fresh array each time. So
   the concatenation is cached and rebuilt only when `userBoards` changes. */
let snapshot: Dashboard[] = DASHBOARDS;
const rebuild = () => {
  snapshot = userBoards.length ? [...DASHBOARDS, ...userBoards] : DASHBOARDS;
  emit();
};
const getSnapshot = () => snapshot;

/** Every board, shipped then made, in the order the rail draws them. */
export function useDashboards(): Dashboard[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * ⚠️ Reads the STORE, not the array.
 *
 * `lib/boards.ts` resolves a board's shipped arrangement through this on every
 * render — `placementsFor` and `resetBoard` both call it. Left pointing at the
 * const array, a board made on a call would have no arrangement to fall back
 * to and would draw as "Dashboard not found" the moment its placements were
 * read. This one line is what makes a new board a real board.
 */
export const findDashboard = (id: string): Dashboard | undefined =>
  snapshot.find((d) => d.id === id);

/** True for a board the user made — the three `⋯` actions are theirs alone. */
export const isUserBoard = (id: string): boolean => userBoards.some((d) => d.id === id);

/**
 * A url-safe id from the name, with a counter when it collides.
 *
 * Readable ids matter more here than they look: the route IS the id, and on a
 * call `/dashboards/northgate-qbr` in the address bar says the board is a real
 * object rather than a mode the app is in. A name of pure punctuation falls
 * back to `board`, so the route is never `/dashboards/`.
 */
function idFor(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'board';
  /* ⚠️ `new` is a ROUTE, not an id — `/dashboards/new` opens the create dialog.
     A board actually called "New" would otherwise take an id that router
     matches first, and the board would be unreachable from its own rail row. */
  if (base !== 'new' && !findDashboard(base)) return base;
  let n = 2;
  while (findDashboard(`${base}-${n}`)) n += 1;
  /* "New" becomes `new-2`, which is a legal id and an honest one. */
  return `${base}-${n}`;
}

/**
 * Make an empty board. Returns its id, for the caller to navigate to.
 *
 * It ships with the common filters and no scope — the three questions every
 * board asks, and no opinion about the answers. A board someone made to answer
 * their own question should not arrive pre-narrowed to ours.
 */
export function createDashboard(name: string): string {
  const id = idFor(name);
  userBoards = [
    ...userBoards,
    { id, name: name.trim(), blurb: 'Made in this session.', filters: COMMON_FILTERS, scope: {}, tiles: [] },
  ];
  rebuild();
  return id;
}

/**
 * Copy a board, tiles and all. Returns the new id.
 *
 * ⭐ `tiles` comes from the CALLER, not from `source.tiles`, and that is the
 * whole point of the action. The arrangement worth copying is the one on the
 * screen — the one with the tile you just dragged and the two you added — and
 * that lives in `lib/boards.ts`. Copying the shipped tiles would hand back the
 * board as it was before the demo started.
 *
 * The copy's own `tiles` then become ITS baseline, so `Reset layout` on a
 * duplicate means "back to the copy as I made it", which is the only reading
 * of reset that is useful on a board that was never shipped.
 */
export function duplicateDashboard(sourceId: string, name: string, tiles: TilePlacement[]): string {
  const source = findDashboard(sourceId);
  const id = idFor(name);
  userBoards = [
    ...userBoards,
    {
      id,
      name: name.trim(),
      blurb: `Copied from ${source?.name ?? 'another board'} in this session.`,
      filters: source?.filters ?? COMMON_FILTERS,
      scope: { ...(source?.scope ?? {}) },
      tiles: tiles.map((t) => ({ ...t })),
    },
  ];
  rebuild();
  return id;
}

export function renameDashboard(id: string, name: string): void {
  userBoards = userBoards.map((d) => (d.id === id ? { ...d, name: name.trim() } : d));
  rebuild();
}

export function deleteDashboard(id: string): void {
  userBoards = userBoards.filter((d) => d.id !== id);
  rebuild();
}
