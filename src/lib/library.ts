import { useSyncExternalStore } from 'react';

import { REPORTS, type Report } from './reports';

/* ============================================================================
   The live report library.

   `REPORTS` is the STARTER set — the eighteen questions Reporter answers
   today, written down. This module is the set the app actually reads: the
   starters plus whatever was built during the session.

   ## Why this exists at all, when nothing persists

   ⭐ Because the demo is a loop, and a loop with a gap in it is not a demo.

   The demo's stated move is to build something live, with the client watching.
   If the
   builder can compose a report but the library cannot show it and a dashboard
   cannot take it, then "save" is a button that appears to work — which is
   worse on a call than not offering one. The loop that has to close is:

       builder → Save to library → it is in Reports → add it to a board

   All four steps are already real except the middle two, and they are this
   file. Reload clears it, which is the honest scope of a prototype: the board
   survives the call and not the night. Making it durable is a back-end
   question and nothing above this line would change.

   `useSyncExternalStore` rather than context because two unrelated trees read
   it — the reports page and the dashboard's add-widget rail — and neither is
   an ancestor of the other. A provider high enough to cover both would be a
   provider around the whole router for one array.
   ========================================================================== */

/**
 * Newest first, starters last.
 *
 * Deliberate: the thing you just made is the thing you are looking for. A
 * library sorted by creation date ascending puts your own work eighteen cards
 * down, behind a set you did not write and have already read.
 */
let live: Report[] = [...REPORTS];

const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The current list. Stable between writes, so `useSyncExternalStore` is happy. */
export const getReports = (): Report[] => live;

/** Every report the app knows about, re-rendering the caller when one is added. */
export function useReports(): Report[] {
  return useSyncExternalStore(subscribe, getReports, getReports);
}

/**
 * Look a report up by id.
 *
 * ⚠️ Everything that resolves a tile must come through here rather than
 * through `findReport` in `reports.ts`, which only ever sees the starters. A
 * dashboard holding a report the user just built would otherwise render an
 * empty tile — the placement would exist and the spec would not.
 */
export const lookupReport = (id: string): Report | undefined =>
  live.find((r) => r.id === id);

/**
 * Add a report, or replace one with the same id.
 *
 * Replacing matters: the builder opens an existing report to edit it, and
 * saving that has to update the card rather than mint a second one with the
 * same name. Position is preserved on a replace, so a card does not jump to
 * the front of the grid because somebody fixed its title.
 */
export function saveReport(report: Report): void {
  const at = live.findIndex((r) => r.id === report.id);
  live = at < 0 ? [report, ...live] : live.map((r, i) => (i === at ? report : r));
  emit();
}

export function deleteReport(id: string): void {
  live = live.filter((r) => r.id !== id);
  emit();
}

/** A fresh id. Enough for a prototype; a real one comes from the server. */
export const newReportId = (): string =>
  `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
