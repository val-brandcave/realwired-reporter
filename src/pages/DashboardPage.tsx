import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ActionMenu,
  AlertDialog,
  Button,
  Callout,
  Chip,
  DashboardGrid,
  PageBody,
  PageHeader,
  TileMenu,
  useToast,
  type IconName,
  type TilePlacement,
  type WidgetTypeId,
} from '@realwired/ui';

import { AddReportRail } from '../components/AddReportRail';
import { BoardSwitcher } from '../components/BoardSwitcher';
import { DashboardNameDialog } from '../components/DashboardNameDialog';
import { useDashboardFilters } from '../components/DashboardFilters';
import { ReportWidget } from '../components/ReportWidget';
import { ORDERS } from '../data/orders';
import { applyPeriod, applyValues, type DateBasis, type Filters } from '../lib/context';
import { findDimension, type OrderRow } from '../lib/fields';
import { bindingDateBasis } from '../lib/binding';
import {
  addToDashboard,
  placementsFor,
  resetBoard,
  setGrain,
  setPlacements as storePlacements,
  setShape,
  useBoards,
} from '../lib/boards';
import {
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  isUserBoard,
  renameDashboard,
  useDashboards,
} from '../lib/dashboards';
import { lookupReport } from '../lib/library';

/**
 * The boards whose shipped filters have already been seeded this session.
 *
 * Module state on purpose — see the seeding effect. It belongs beside the
 * boards store in spirit; it lives here because it is about arriving on a
 * route, which is this file's business and nothing else's.
 */
const seeded = new Set<string>();

/** Read a dimension off a row by key. The value filter's accessor. */
function readDimension(row: OrderRow, key: string): string {
  const dim = findDimension(key);
  return dim ? dim.get(row, 'month') : '';
}

/**
 * A dashboard — the board rearranged live in the demo.
 *
 * ## What is state here, and why
 *
 * Placements, scope and per-tile shape overrides are component state rather
 * than anything persisted. That is the honest scope of a prototype: the board
 * survives being rearranged during the call and resets on reload, which is
 * what you want for a demo that gets run twice. Making it durable is a
 * back-end question and nothing above this line would change.
 *
 * The FILTERS are deliberately not state here either — they belong above the
 * router so a value survives a dashboard switch, which is what makes a field
 * two boards share keep its value. They live in `App` and arrive as props.
 */
export interface DashboardPageProps {
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
}

export function DashboardPage({ filters, onFiltersChange }: DashboardPageProps) {
  const { id = 'overview' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  /*
   * ⚠️ Through the STORE, not `findDashboard` directly.
   *
   * Renaming a board has to change the title you are looking at. Read off the
   * module function the page holds the object it found on mount, the rail
   * updates and the page header does not — which reads as the rename having
   * half worked.
   */
  const dashboards = useDashboards();
  const dashboard = dashboards.find((d) => d.id === id);
  const userBoard = isUserBoard(id);

  /*
   * The arrangement, the shape swaps and the pinned date bands live in
   * `lib/boards.ts`, not here.
   *
   * They were local state, and they moved out so the report builder's
   * `Add to dashboard` could actually place a tile — a button that names a
   * destination and then leaves the user to find it reads as broken. The side
   * benefit is that an arrangement now survives a trip to Reports and back,
   * which a live session wants.
   *
   * The global CONTEXT is still not state here for the original reason: it
   * belongs above the router so it survives a dashboard switch. It lives in
   * `App` and arrives as props.
   */
  const board = useBoards();

  const [adding, setAdding] = useState(false);
  /*
   * Reading and editing are two modes, and the board says which one it is in.
   *
   * ⭐ Not a preference — the acceptance criterion. The demo opens a composed
   * board and then changes it live, in front of the client. If the board is
   * always editable, every tile carries a toolbar nobody asked for and a
   * stray drag reflows a dashboard someone was reading. If it is never
   * editable, the demo does not exist.
   *
   * So editing is entered deliberately and it is VISIBLE: the controls appear
   * on the tiles, the hint line explains the two gestures, and "Done" leaves.
   * The mode change is its own announcement, which is why there is no banner.
   */
  const [editing, setEditing] = useState(false);

  /*
   * Arriving already in edit mode, from the create flow.
   *
   * ⭐ A board created and then handed over in READ mode is a blank screen
   * with an Edit button — it makes the user ask for permission to use the
   * thing they just made. Creating a dashboard is a statement of intent to put
   * something on it, so the next screen is the one where you can.
   *
   * ⚠️ An effect rather than a `useState` initialiser, and this is the trap:
   * `/dashboards/:id` renders ONE component for every board, so navigating
   * from Overview to a new board does not remount and an initialiser never
   * runs again. `location.key` changes on every navigation, which is the only
   * thing here that does.
   */
  useEffect(() => {
    const arrival = location.state as { editing?: boolean; adding?: boolean } | null;
    if (arrival?.editing) setEditing(true);
    if (arrival?.adding) setAdding(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  /* Which naming dialog is open, if any. One component serves all three —
     see `DashboardNameDialog`. */
  const [naming, setNaming] = useState<'create' | 'duplicate' | 'rename' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const placements = placementsFor(board, id);

  /*
   * The fields this board filters by, and the values it ships with.
   *
   * ⭐ `fields` is what makes the shared filter map per-dashboard: everything
   * below narrows by these keys and nothing else, so a value set on another
   * board for a field this one does not offer is not silently in force. See
   * the shared-map note in `lib/context.ts`.
   */
  const fields = dashboard?.filters ?? [];
  const shipped = dashboard?.scope ?? {};

  /* The live filters, for the seeding effect below — it must read the current
     map without re-running whenever the reader changes a filter. */
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  /*
   * A board's SHIPPED filters, applied the first time you arrive on it.
   *
   * ⚠️ This is a real behaviour and it was missing for one build: with the
   * values in one shared map, a board's own default scope has to get INTO that
   * map or it never applies. MEASURED when it did not: Transactions ships
   * `status: Complete` and read `Covers 587 of 587 (100%)` with no badge —
   * the board silently counted cancelled work in its billing figures.
   *
   * Three properties, and the seeding rules follow from them:
   *
   * - **Once per board, on first arrival.** Not on every render, or `Clear
   *   all` would be undone by the next paint — and `Clear all` says all.
   * - **Only fields the map does not already hold.** A value the reader chose
   *   on another board is their decision and outranks our default; re-seeding
   *   over it would change their filter by navigating.
   * - **Session-scoped, like the boards store.** `seeded` is module state, so
   *   it survives leaving the route and resets on reload, exactly as the
   *   arrangement does.
   */
  const seedRef = useRef(shipped);
  seedRef.current = shipped;
  useEffect(() => {
    if (seeded.has(id)) return;
    seeded.add(id);
    const defaults = seedRef.current;
    const missing = Object.entries(defaults).filter(
      ([key, values]) => values?.length && !filtersRef.current.values[key]?.length
    );
    if (!missing.length) return;
    const values = { ...filtersRef.current.values };
    for (const [key, v] of missing) values[key] = v;
    onFiltersChange({ ...filtersRef.current, values });
    // The board id is the trigger; everything else is read through a ref so a
    // filter change cannot re-run the seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setPlacements = useCallback((next: TilePlacement[]) => storePlacements(id, next), [id]);

  /*
   * Put the board back to the one we ship.
   *
   * ⭐ The safety net that makes live editing safe to demonstrate. Rearranging
   * a dashboard in front of a client is only a confident move if getting back
   * is one click — otherwise a mis-drag ends the demo, and the fear of that
   * shows. It drops the layout AND the per-tile shape swaps, because a board
   * that returned to its saved positions while still drawing a donut somebody
   * chose by accident has not been reset.
   */
  const resetLayout = useCallback(() => resetBoard(id), [id]);

  /* ── The three things you can do to a board, from the ⋯ menu ─────────────
     They are grouped here rather than inline in the header because each one
     ends by NAVIGATING, and a handler that changes the route is worth reading
     next to the other two that do. */

  /**
   * Copy the board as it is NOW.
   *
   * ⭐ `placements`, not `dashboard.tiles`. The arrangement worth copying is
   * the one on the screen — the tile just dragged, the two just added — and it
   * lives in the boards store. Copying the shipped tiles would hand back the
   * board as it was before the demo started, which is the opposite of what
   * "duplicate this" means to the person who just changed it.
   *
   * The copy opens in READ mode. A duplicate arrives finished; a blank board
   * does not, which is why only creation lands in edit.
   */
  const confirmDuplicate = useCallback(
    (name: string, icon: IconName) => {
      const newId = duplicateDashboard(id, name, placements, icon);
      setNaming(null);
      navigate(`/dashboards/${newId}`);
    },
    [id, placements, navigate]
  );

  const confirmRename = useCallback(
    (name: string, icon: IconName) => {
      renameDashboard(id, name, icon);
      setNaming(null);
      /* No toast. The title in front of you changes and the rail row changes
         with it — an acknowledgement of something you can already see is
         noise. */
    },
    [id]
  );

  /**
   * Delete, then leave.
   *
   * Both are state updates in one batch, so the page never renders the gap:
   * without the navigate it would paint "Dashboard not found" for the board
   * the user just deleted, which reads as an error rather than a completed
   * action. The toast is the one here that earns its place — the thing is gone
   * and the screen you land on cannot say so.
   */
  const confirmDeleteBoard = useCallback(() => {
    const name = dashboard?.name ?? 'dashboard';
    setConfirmDelete(false);
    navigate('/dashboards/overview');
    deleteDashboard(id);
    toast({ tone: 'success', title: `Deleted ${name}` });
  }, [dashboard, id, navigate, toast]);

  const remove = useCallback(
    (tileId: string) => setPlacements(placements.filter((p) => p.id !== tileId)),
    [placements, setPlacements]
  );

  const add = useCallback(
    (reportId: string) => {
      addToDashboard(id, reportId);
      setAdding(false);
    },
    [id]
  );

  /* ---- the period, then the board's own value filters ---- */

  /*
   * Three books, not one — keyed by which date the period tests.
   *
   * A widget that groups by submission month must have its period filtered on
   * submission, or the chart spreads the board's rows over a wider window than
   * the headline and invents a movement at the edges. See `DateBasis`.
   *
   * Three arrays rather than one per widget: there are only ever three bases,
   * so this is bounded, memoised on the filters, and cheaper than re-scoping
   * inside every tile on every layout tick during a drag.
   *
   * `inContext` is the period alone — what a widget's coverage line compares
   * against, so "excludes 14 orders" can name the filters rather than the
   * calendar. `inScope` is what it draws.
   */
  const books = useMemo(() => {
    const scoped = (basis: DateBasis) => {
      const inContext = applyPeriod(ORDERS, filters.range, basis);
      const inScope = applyValues(inContext, filters.values, fields, readDimension);
      return { inContext, inScope };
    };
    return {
      either: scoped('either'),
      submittedAt: scoped('submittedAt'),
      completedAt: scoped('completedAt'),
    } satisfies Record<DateBasis, { inContext: OrderRow[]; inScope: OrderRow[] }>;
  }, [filters, fields]);

  /* The button, the pill row and the modal. Three nodes for three slots — see
     `useDashboardFilters` for why this is a hook. */
  const filterParts = useDashboardFilters({
    filters,
    onChange: onFiltersChange,
    fields,
    shipped,
  });

  /*
   * Built from the placements, NOT inline in the render.
   *
   * `DashboardGrid` memoises each tile on its `children` reference. Rebuilding
   * these on every render would defeat it, and every layout tick during a drag
   * would re-resolve nine bindings and re-run every chart's scales.
   */
  const tiles = useMemo(
    () =>
      placements.map((p) => {
        const report = lookupReport(p.id);
        if (!report) return { ...p, type: 'bar' as WidgetTypeId, children: null };
        const shape = board.shapes[p.id] ?? report.type;
        /* The report's own binding chooses which date its period tests. */
        const book = books[bindingDateBasis(report.binding)];
        /*
         * A pinned band overrides the report's own, and only when one is
         * pinned. `p.id in grains` rather than a truthiness test: pinning then
         * un-pinning stores `undefined`, which MEANS auto, and `?? report...`
         * would have quietly restored the saved value instead.
         */
        const binding =
          p.id in board.grains
            ? { ...report.binding, granularity: board.grains[p.id] }
            : report.binding;

        return {
          ...p,
          type: shape,
          children: (
            <ReportWidget
              editing={editing}
              onTypeChange={(next) => setShape(p.id, next)}
              onGranularityChange={(g) => setGrain(p.id, g)}
              className="rw-tile-card"
              report={report}
              type={shape}
              binding={binding}
              rows={book.inScope}
              allRows={book.inContext}
              /* Auto-granularity reads the range's LENGTH — the filtering was
                 already done above, in `books`. */
              range={filters.range}
              partialPeriod={filters.range.partial ? filters.range.covered : undefined}
              /* The callout above the board says it once. Nine chips saying
                 it again cost every stat card its title. */
              showPartialChip={false}
              fill
              actions={
                <TileMenu
                  onRemove={() => remove(p.id)}
                  /* Swapping the shape is a ONE-FIELD edit on the report,
                     which is the third thing the demo has to do live.
                     It cycles through the shapes the binding actually fits, so
                     it can never land on one the data cannot draw. */
                  onChangeShape={() => cycleShape(p.id, report.type, board.shapes)}
                />
              }
            />
          ),
        };
      }),
    [placements, books, filters.range, board.shapes, board.grains, remove, editing]
  );

  /*
   * `/dashboards/new` — the create flow.
   *
   * ⭐ It is a ROUTE, not a modal opened from a button, and the reason is the
   * rail: `New dashboard` is a row in a list of links, so it has to go
   * somewhere. Making it the one row that fires a callback would break the
   * keyboard model of the whole rail for the sake of a dialog the route can
   * open anyway.
   *
   * What sits behind the dialog is the empty board itself. So pressing
   * `Create dashboard` does not cut to a different screen — the dialog closes
   * and the board that was already there becomes real and named. The
   * transition is the point: it shows that a new dashboard is a thing that
   * exists, not a form that was submitted.
   */
  if (id === 'new') {
    return (
      <>
        <PageHeader title="New dashboard" />
        <PageBody>
          <EmptyBoard />
        </PageBody>
        <DashboardNameDialog
          open
          title="New dashboard"
          confirmLabel="Create dashboard"
          onConfirm={(name, icon) => {
            const newId = createDashboard(name, icon);
            navigate(`/dashboards/${newId}`, {
              replace: true,
              state: { editing: true, adding: true },
            });
          }}
          /* Back where they were. `replace` on the create above keeps this
             route out of the history, so a Back press after creating does not
             reopen the dialog for a board that now exists. */
          onCancel={() => navigate(-1)}
        />
      </>
    );
  }

  if (!dashboard) {
    return (
      <>
        <PageHeader title="Dashboard not found" />
        <PageBody>
          <p className="text-sm text-ink-2">
            No dashboard is saved as “{id}”. Pick one from the sidebar.
          </p>
        </PageBody>
      </>
    );
  }

  const present = new Set(placements.map((p) => p.id));

  return (
    <>
      {/*
        ⭐ The header band carries both rows now — Val's round 2, 10 Sept.

        The title row holds the two things you can do to a dashboard: filter it
        and edit it. The `toolbar` row below states what is applied. They are
        rows of ONE band with one bottom hairline, which is the difference he
        asked for: a bordered box on the canvas reads as a component that
        happens to sit above the board, and a second header row reads as this
        page being filtered.

        There is no `description`. The board's blurb was cut — a board called
        `Transactions` does not need a line saying it is about transactions.
      */}
      <PageHeader
        /*
          ⭐ The board's name is now a SWITCHER, not a label — 18 Sept. The app
          header says "Dashboards"; this says which one, and lets you change
          it. See `BoardSwitcher` for why the rail is not enough on its own.
        */
        title={
          <BoardSwitcher
            current={{ id: dashboard.id, name: dashboard.name, icon: dashboard.icon }}
          />
        }
        /*
          Edit mode used to be said by rewriting the title to "Editing
          Overview". It cannot be now — the title is a control, and a control
          whose label changes under you is a different control. A badge beside
          it says the same thing without touching the name, and it sits where
          `PageHeader` already puts state.
        */
        badges={
          editing ? (
            <Chip tone="warning">Editing</Chip>
          ) : undefined
        }
        actions={
          editing ? (
            <>
              {/*
                ⚠️ Only when there is something to reset TO.
                `resetBoard` restores the board's shipped `tiles`, and a board
                created empty ships with none — so on a new board the control
                would quietly delete everything just added, under a word that
                promises the opposite. A DUPLICATE does have a baseline (the
                copy as made), so it keeps the button.
              */}
              {dashboard.tiles.length > 0 && (
                <Button size="control" variant="ghost" onClick={resetLayout}>
                  Reset layout
                </Button>
              )}
              {/* "report", not "widget" — 18 Sept. They are the same object,
                  and the app was calling it both: the library, the builder and
                  every toast said report, and only this button and the empty
                  state said widget. `widget` is what the code calls the thing;
                  it is not what the reader calls it. */}
              <Button size="control" iconLeft="add" onClick={() => setAdding(true)}>
                Add a report
              </Button>
              {/* The primary action LEAVES the mode. The way out of a mode is
                  the most important control in it. */}
              <Button size="control" onClick={() => setEditing(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              {filterParts.button}
              <Button
                size="control"
                variant="outline"
                iconLeft="edit"
                onClick={() => setEditing(true)}
              >
                Edit dashboard
              </Button>
              {/*
                ⭐ What you can do to the board AS AN OBJECT, as opposed to the
                two controls beside it, which change what the board SHOWS.
                That is the line the menu draws, and it is why `Duplicate` sits
                here rather than next to `Edit dashboard` as a third button:
                three peer controls in one row would say these are three
                equally likely things to do, and they are not.

                `Duplicate` is offered on every board, including the five we
                ship — taking `Transactions`, making it yours and stripping two
                tiles is the likeliest way anyone gets a board of their own.
                `Rename` and `Delete` are for boards the user made; renaming
                `Overview` out from under the demo helps nobody.
              */}
              <ActionMenu
                label="Dashboard actions"
                align="end"
                items={[
                  {
                    id: 'duplicate',
                    label: 'Duplicate dashboard',
                    icon: 'copy',
                    onSelect: () => setNaming('duplicate'),
                  },
                  ...(userBoard
                    ? [
                        {
                          id: 'rename',
                          label: 'Rename…',
                          icon: 'edit' as const,
                          onSelect: () => setNaming('rename'),
                        },
                        {
                          id: 'delete',
                          label: 'Delete dashboard',
                          icon: 'trash' as const,
                          tone: 'danger' as const,
                          separatorBefore: true,
                          onSelect: () => setConfirmDelete(true),
                        },
                      ]
                    : []),
                ]}
              />
            </>
          )
        }
        /*
         * In edit mode the row carries the two gestures instead of the pills.
         * The filters have not changed and are not editable from here while
         * editing — what you can do to the board right now is the more useful
         * thing for the row to say, and saying both would put a sentence and a
         * pill band in one line.
         */
        toolbar={
          editing ? (
            <p className="text-base text-ink-3">
              Drag a tile to move it, or pull its bottom-right corner to resize. Each tile’s
              controls change what it draws.
            </p>
          ) : (
            filterParts.summary
          )
        }
      />

      <PageBody>
        {/*
          ⚠️ The board does NOT shrink for the rail, and that was tried.

          Narrowing the container does make `DashboardGrid` re-lay out, and it
          looks impressive for a second. Then the tiles are 436px narrower than
          the layout was composed for, and MEASURED on a 1920px screen the four
          stat cards truncated to "Complet…", "Total clie…" and "Average …"
          while the donut's slice labels overlapped its coverage line. Trading
          a legible board for an animation is the wrong trade — the whole
          reason this is a rail is that the board stays readable.

          So the rail overlays, and what makes that acceptable is that it has
          no scrim and no focus trap: the board stays lit, stays interactive,
          and is exactly as you left it when the rail closes.
        */}
        <div className="flex flex-col gap-4">
          {/*
            The partial-period caveat, above the board it applies to.

            It used to be a third band of the filter card. With the card gone
            it needs a home, and this is the right one: it is not a statement
            about the filters, it is a warning about every figure below — so it
            belongs with the figures, in the one component in the library whose
            job is exactly this.
          */}
          {filters.range.partial && (
            <Callout tone="warning">
              <span className="rw-numeric font-semibold">{filters.range.covered}</span> so far.
              Every widget below covers a period that has not finished, so its comparison against
              a full previous period is not like for like — the movements are shown without a
              judgement. Pick <strong className="font-semibold">Previous billing cycle</strong> or{' '}
              <strong className="font-semibold">Last month</strong> for a closed period.
            </Callout>
          )}

          {/*
            ⭐ Drag and resize belong to edit mode — Val's round 2, 10 Sept.
            A board being read must not reflow under a stray drag, and a tile
            that lights up under the cursor is a promise of a gesture.

            ⚠️ NOT `readOnly`, which stacks the board into one column at
            natural heights. `editable={false}` keeps the arrangement exactly
            as composed and takes away only the ability to change it. See the
            prop's own note in `DashboardGrid`.
          */}
          {placements.length === 0 ? (
            <EmptyBoard
              onAdd={
                editing
                  ? undefined
                  : () => {
                      /* The button says "Add a report", so it adds a report —
                         entering edit mode is the app's business, not a step
                         the reader should have to take first. */
                      setEditing(true);
                      setAdding(true);
                    }
              }
            />
          ) : (
            <DashboardGrid
              tiles={tiles}
              editable={editing}
              onPlacementsChange={setPlacements}
            />
          )}
        </div>
      </PageBody>

      {filterParts.dialog}

      <AddReportRail
        open={adding}
        onClose={() => setAdding(false)}
        presentIds={present}
        onAdd={add}
      />

      {/* One dialog, two of its three jobs. `initialName` is what makes them
          different: duplicating arrives with a name to edit, renaming with the
          name to replace. */}
      <DashboardNameDialog
        open={naming === 'duplicate' || naming === 'rename'}
        title={naming === 'rename' ? 'Rename dashboard' : 'Duplicate dashboard'}
        confirmLabel={naming === 'rename' ? 'Save name' : 'Duplicate board'}
        initialName={naming === 'rename' ? dashboard.name : `${dashboard.name} (copy)`}
        /* ⭐ Seeded from the board in BOTH jobs, which is what makes a copy
           keep its source's glyph without `duplicateDashboard` needing a rule
           about inheritance — the dialog opens on it, and the reader either
           accepts it or changes it like anything else in the form. */
        initialIcon={dashboard.icon}
        onConfirm={naming === 'rename' ? confirmRename : confirmDuplicate}
        onCancel={() => setNaming(null)}
      />

      {/*
        The description says what SURVIVES, because that is the thing anyone
        hesitates over. A board is an arrangement of references; deleting it
        deletes the arrangement and nothing else, and a reader who does not
        know that will assume the worst and keep a board they do not want.
      */}
      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${dashboard.name}?`}
        description="The dashboard and its arrangement go away. The reports on it stay in your library."
        confirmLabel="Delete dashboard"
        tone="danger"
        icon="trash"
        onConfirm={confirmDeleteBoard}
      />
    </>
  );
}

/**
 * A board with nothing on it.
 *
 * ⭐ An empty screen is an invitation to act, so this one is a sentence and a
 * way forward rather than a report that a count is zero. The second line does
 * real work: it names the two things the rail offers — a report someone
 * already framed, or a bare shape to fill — so the reader knows what is behind
 * the button before pressing it.
 *
 * No dashed drop-zone and no illustration. A dashed rectangle would be the
 * generic empty state, and here it would also be a lie: tiles are placed from
 * the rail, not dragged into the board from outside, so an outline promising a
 * target that does not accept a drop is worse than no outline.
 *
 * `onAdd` is absent in edit mode, where `Add a report` is already in the
 * header two inches above. One button, in one place, per screen.
 */
function EmptyBoard({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-lg font-semibold text-ink">Nothing on this board yet.</p>
      <p className="max-w-[46ch] text-base text-ink-2">
        Add a saved report, or start a new one from a shape.
      </p>
      {onAdd && (
        <Button className="mt-2" iconLeft="add" onClick={onAdd}>
          Add a report
        </Button>
      )}
    </div>
  );
}

/* ============================================================================
   Helpers
   ========================================================================== */

/**
 * Cycle a tile through the shapes its binding fits.
 *
 * Two shapes only — the saved one and the next best alternative the catalogue
 * suggests — because a menu item that cycles is for showing that a swap is
 * cheap, not for choosing among fifteen. Choosing is the builder's job.
 */
function cycleShape(tileId: string, saved: WidgetTypeId, shapes: Record<string, WidgetTypeId>) {
  const current = shapes[tileId] ?? saved;
  const alternatives = ALTERNATIVES[saved] ?? [];
  const ring = [saved, ...alternatives];
  setShape(tileId, ring[(ring.indexOf(current) + 1) % ring.length]);
}

/**
 * The shape a swap lands on, per starting shape.
 *
 * Hand-declared rather than taken from `suggestWidgets`, and that is a
 * deliberate limit on this session's scope: `suggest` ranks by what the
 * binding SUPPORTS, which includes shapes that would technically render and
 * read badly for the specific question the report was written to answer.
 * Wiring the ranked list in belongs with the builder, where the user can see
 * the caveat text that comes with each option.
 */
const ALTERNATIVES: Partial<Record<WidgetTypeId, WidgetTypeId[]>> = {
  bar: ['hbar', 'table'],
  hbar: ['bar', 'table'],
  line: ['area', 'bar'],
  area: ['line', 'bar'],
  donut: ['bar', 'table'],
  table: ['bar'],
  stat: ['dial'],
  dial: ['stat'],
  combo: ['area', 'table'],
  target: ['hbar', 'table'],
  distribution: ['bar'],
  durations: ['hbar'],
  heatmap: ['table'],
  watchlist: ['table'],
};
