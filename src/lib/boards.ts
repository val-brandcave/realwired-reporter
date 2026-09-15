import { useSyncExternalStore } from 'react';
import { widgetSize, type TilePlacement, type WidgetTypeId } from '@realwired/ui';

import { findDashboard, useDashboards } from './dashboards';
import type { Granularity } from './fields';
import { lookupReport } from './library';

/* ============================================================================
   What the user has done to the boards during this session.

   Three maps, all keyed by dashboard id: the arrangement, the per-tile shape
   swaps, and the per-tile date bands. They were `useState` inside
   `DashboardPage`, and they moved here for one reason —

   ⭐ the builder's `Add to dashboard` has to actually add to a dashboard.

   A button that names a destination and then leaves the user to find it is
   worse than no button, and on a call it reads as broken. Placing a tile from
   another route means the arrangement cannot live inside the route that draws
   it.

   Two things fall out of the move for free, both of which a live demo wants:
   an arrangement now survives a trip to Reports and back, and `Reset layout`
   still clears all three together, which is what makes rearranging in front of
   a client a confident move rather than a risk.

   Still session-scoped. Reload restores the boards we ship — the honest scope
   of a prototype, and nothing above this line changes when it becomes durable.
   ========================================================================== */

interface BoardState {
  placements: Record<string, TilePlacement[]>;
  shapes: Record<string, WidgetTypeId>;
  /** Absent means AUTO — see `ReportBinding.granularity`. */
  grains: Record<string, Granularity | undefined>;
}

let state: BoardState = { placements: {}, shapes: {}, grains: {} };

const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const getState = () => state;

export function useBoards(): BoardState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** The arrangement in force — the user's, or the one we ship. */
export function placementsFor(state: BoardState, dashboardId: string): TilePlacement[] {
  return state.placements[dashboardId] ?? findDashboard(dashboardId)?.tiles ?? [];
}

export function setPlacements(dashboardId: string, next: TilePlacement[]): void {
  state = { ...state, placements: { ...state.placements, [dashboardId]: next } };
  emit();
}

export function setShape(tileId: string, type: WidgetTypeId): void {
  state = { ...state, shapes: { ...state.shapes, [tileId]: type } };
  emit();
}

export function setGrain(tileId: string, g: Granularity | undefined): void {
  state = { ...state, grains: { ...state.grains, [tileId]: g } };
  emit();
}

/**
 * Put a board back to the arrangement we ship.
 *
 * Drops the layout AND the per-tile shape swaps AND the pinned date bands,
 * because a board that returned to its saved positions while still drawing a
 * donut somebody chose by accident has not been reset. It is the safety net
 * that makes live editing safe to demonstrate.
 */
export function resetBoard(dashboardId: string): void {
  const tiles = findDashboard(dashboardId)?.tiles ?? [];
  const placements = { ...state.placements };
  delete placements[dashboardId];

  const shapes = { ...state.shapes };
  const grains = { ...state.grains };
  for (const t of tiles) {
    delete shapes[t.id];
    delete grains[t.id];
  }

  state = { placements, shapes, grains };
  emit();
}

/**
 * Place a report on a board, below everything already there.
 *
 * The size comes from the LIBRARY's catalogue rather than a table in this
 * file — a second copy of the default sizes would drift from the floors the
 * grid enforces, which is the exact failure the catalogue exists to end.
 *
 * Returns false when the board already carries it, so the caller can say so
 * instead of silently doing nothing.
 */
export function addToDashboard(dashboardId: string, reportId: string): boolean {
  const current = placementsFor(state, dashboardId);
  if (current.some((p) => p.id === reportId)) return false;

  const report = lookupReport(reportId);
  const def = widgetSize(report?.type ?? 'bar').def;
  /* Any y past the bottom resolves to the first free row — the grid compacts
     upward, so this lands it last without computing where last is. */
  const y = current.reduce((max, p) => Math.max(max, p.y + p.h), 0);

  setPlacements(dashboardId, [...current, { id: reportId, x: 0, y, w: def[0], h: def[1] }]);
  return true;
}

/**
 * Every board, for the builder's destination menu.
 *
 * ⚠️ A HOOK now, not a plain function, and the change is load-bearing: the
 * menu has to include a board made a minute ago on another route. Read off the
 * const array it listed the five we ship and quietly omitted the one the
 * demo just created — and "Add to dashboard" that cannot see your dashboard is
 * the exact broken-button problem the comment at the top of this file exists
 * to prevent.
 */
export function useBoardOptions(): { id: string; name: string }[] {
  const dashboards = useDashboards();
  return dashboards.map((d) => ({ id: d.id, name: d.name }));
}
