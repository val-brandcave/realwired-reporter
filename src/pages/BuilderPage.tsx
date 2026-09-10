import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ActionMenu,
  Button,
  Callout,
  Chip,
  Icon,
  Input,
  SearchInput,
  SegmentedControl,
  Select,
  WIDGET_DEFINITIONS,
  WidgetPicker,
  tileSizePx,
  widgetSize,
  type WidgetTypeId,
} from '@realwired/ui';

import { ReportWidget } from '../components/ReportWidget';
import { ORDERS } from '../data/orders';
import {
  bindingDateBasis,
  bindingShape,
  describeBinding,
  EMPTY_BINDING,
  resolveBinding,
  validate,
  type ReportBinding,
} from '../lib/binding';
import { addToDashboard, boardOptions } from '../lib/boards';
import { applyPeriod, type Filters } from '../lib/context';
import {
  AGG_FULL,
  DIMENSIONS,
  MEASURES,
  dimensionValues,
  findDimension,
  findMeasure,
  type Aggregation,
} from '../lib/fields';
import { lookupReport, newReportId, saveReport } from '../lib/library';
import type { Report } from '../lib/reports';

/* ============================================================================
   The report builder.

   ⭐ The screen that proves the architecture. A report is `{ type, binding,
   options }` — so this page is not a chart editor, it is an editor for that
   object, and the copilot writes the same one. If the builder needed anything
   the spec cannot express, the premise would be broken.

   Built to the approved `Builder` artboard: three columns — the field
   catalogue, the live preview, the binding shelf — with the shape picker at
   the top of the shelf and the validator talking underneath the preview.

   ## Two places this deviates from the artboard, and why

   **The gesture.** The artboard says "Drag a field into a slot". Dragging
   works here and is wired, but a CLICK also places a field, and the copy says
   both. A demo driven on an unfamiliar trackpad should not have a
   drag as the only route to the first step, and click is faster for the person
   driving. Nothing is lost — the artboard's gesture still works.

   **The field names.** The artboard lists `Workflow stage`, `Valuation age
   band` and `Client total fee`, which were drawn before the catalogue existed.
   The real atoms are in `lib/fields.ts` and they are what ships: a builder
   offering a field the resolver cannot read would be a demo that breaks on the
   second click. The artboard is binding on the STRUCTURE of the panel, which
   is what it is here for.
   ========================================================================== */

/** A field being dragged. Two kinds, because they go to different slots. */
type DragPayload = { kind: 'dimension' | 'measure'; key: string };

const DRAG_TYPE = 'application/x-reporter-field';

export interface BuilderPageProps {
  /**
   * The shared filter state — read for its PERIOD only.
   *
   * ⚠️ Changed on 10 Sept with the tier collapse, and worth knowing: the
   * preview used to also narrow by the global organization. Filters now belong
   * to a dashboard, and the builder is not a dashboard — so a report being
   * built previews against the whole book for the current period, rather than
   * through whichever board's filters happened to be set last. That is the
   * more honest preview: the report will be placed on some board later, and it
   * is not this screen's job to guess which.
   */
  filters: Filters;
}

/**
 * ⚠️ A keyed wrapper, and it is load-bearing rather than tidy.
 *
 * `/reports/new` and `/reports/:id` render the SAME component at the same
 * position in the route tree, so React reconciles them as one instance and
 * `useState` is never re-initialised. Measured: opening a saved report, going
 * back, and clicking `New report` produced a "new" report still carrying the
 * previous one's shape, measure and target — and saving it would have written
 * a second copy of somebody else's report under a new id.
 *
 * The `key` forces a remount per report, which is what makes the draft belong
 * to the route rather than to the component.
 */
export function BuilderPage({ filters }: BuilderPageProps) {
  const { id } = useParams();
  return <Builder key={id ?? 'new'} filters={filters} />;
}

function Builder({ filters }: BuilderPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();

  const existing = id ? lookupReport(id) : undefined;

  /*
   * The draft. One object, which is the point of the whole screen.
   *
   * Seeded from the report being edited, or from a bare shape — `bar` rather
   * than nothing, because an empty preview cannot show what a shape does and
   * the first thing a user wants to see is the frame they are filling.
   */
  const [draft, setDraft] = useState<Report>(
    () =>
      existing ?? {
        id: newReportId(),
        title: '',
        hint: '',
        type: 'bar',
        binding: { ...EMPTY_BINDING },
        origin: 'user',
        tags: [],
      }
  );

  const [query, setQuery] = useState('');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  /*
   * A report opened from the library is already SAVED, not a draft.
   *
   * It started as `false` and every existing report opened reading "Draft" —
   * which says the thing in front of you is unsaved work and invites a save
   * that would change nothing. The chip tracks divergence from the library,
   * so it starts true for something that came out of it and any edit clears
   * it (`patch` and the title field both do).
   */
  const [saved, setSaved] = useState(Boolean(existing));

  const def = WIDGET_DEFINITIONS[draft.type];
  const binding = draft.binding;
  /*
   * ⚠️ Read ONCE with its default applied. `accepts.breakdown` is optional, so
   * an omitted value is `undefined` — and `undefined !== 'no'` is true, which
   * offered a Breakdown slot on every shape that takes no split. It showed up
   * on `target`, where a second dimension has nowhere to go and the slot was
   * an invitation to build something the validator would then refuse.
   */
  const takesBreakdown = (def.accepts.breakdown ?? 'no') !== 'no';

  const patch = useCallback(
    (next: Partial<ReportBinding>) => {
      setDraft((d) => ({ ...d, binding: { ...d.binding, ...next } }));
      setSaved(false);
    },
    []
  );

  /* ---- resolve, and ask the library whether it fits ---- */

  /*
   * ⚠️ Filtered on the date the binding GROUPS BY — `bindingDateBasis`, not the
   * blended default.
   *
   * This was `applyContext(ORDERS, ctx)`, and it reproduced TRAPS §3 in a
   * brand-new screen. MEASURED: `Order activity` groups by submission and the
   * default period is a completion-based cycle, so the preview spread its rows
   * over NINE weekly buckets from w/c 15 Jun to w/c 10 Aug while the dashboard
   * drew the same report over FIVE. The preview was not previewing the tile.
   *
   * Derived from the binding, so swapping the x dimension moves the filter
   * with it — the same fix, for the same reason, as on the board.
   */
  const rows = useMemo(
    () => applyPeriod(ORDERS, filters.range, bindingDateBasis(binding)),
    [filters.range, binding]
  );
  const resolved = useMemo(
    () => resolveBinding(binding, rows, filters.range),
    [binding, rows, filters.range]
  );
  const fit = useMemo(
    () => validate(draft.type, binding, resolved.series),
    [draft.type, binding, resolved.series]
  );
  const shapeDesc = useMemo(
    () => bindingShape(binding, resolved.series),
    [binding, resolved.series]
  );

  /**
   * Where a field goes when it is placed.
   *
   * ⭐ The rule the whole left panel rests on, and it is deliberately not "the
   * slot you dropped it on". A measure has one sensible home, a dimension has
   * two, and a target measure has exactly one — so a single click can be
   * right almost every time, and dropping on a specific slot still overrides.
   */
  const place = useCallback(
    (payload: DragPayload, slot?: 'x' | 'breakdown' | 'target') => {
      const { kind, key } = payload;

      if (kind === 'dimension') {
        /*
         * ⚠️ A dimension occupies ONE slot. Assigning it to a slot vacates the
         * other, rather than sitting in both.
         *
         * Grouping by request category and splitting by request category
         * resolves to a diagonal — seven groups, each with one non-null series
         * and six nulls — which draws as an almost-empty chart with a
         * seven-item legend. It renders, it errors nowhere, and it is
         * meaningless. Found by fumbling into it while testing.
         */
        if (slot === 'breakdown') {
          return patch({ breakdown: key, ...(binding.x === key ? { x: null } : {}) });
        }
        if (slot === 'x') {
          return patch({ x: key, ...(binding.breakdown === key ? { breakdown: null } : {}) });
        }

        /* Unaddressed, and already in play: leave it where it is. Re-placing a
           bound field would move it for no reason the user asked for. */
        if (binding.x === key || binding.breakdown === key) return;

        /* Otherwise fill the axis first, then the split — the order the chart
           is read in. */
        if (!binding.x) return patch({ x: key });
        if (takesBreakdown && !binding.breakdown) return patch({ breakdown: key });
        return patch({ x: key });
      }

      const measure = findMeasure(key);
      if (!measure) return;

      /* A goal only ever means a target. See `targetOnly`. */
      if (measure.targetOnly || slot === 'target') return patch({ targetOf: key });

      const already = binding.y.some((m) => m.key === key);
      if (already) return;
      /* Past the shape's ceiling, REPLACE rather than append. Appending would
         hand the user an invalid binding and a validator complaining about a
         click it just accepted. */
      const next =
        binding.y.length >= def.accepts.measures.max
          ? [...binding.y.slice(0, -1), { key, agg: measure.defaultAgg }]
          : [...binding.y, { key, agg: measure.defaultAgg }];
      patch({ y: next });
    },
    [binding, def, takesBreakdown, patch]
  );

  /* ---- the two actions in the header ---- */

  const title = draft.title.trim() || describeBinding(binding);

  const commit = useCallback((): Report => {
    /* An untitled report is saved under the title the binding describes, so a
       card in the library never reads "Untitled". Same string the preview
       shows, so nothing changes at the moment of saving. */
    const report: Report = { ...draft, title };
    saveReport(report);
    setDraft(report);
    setSaved(true);
    return report;
  }, [draft, title]);

  const canSave = fit.ok && binding.y.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---- header ---- */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-surface px-6 py-3">
        <Button
          size="control"
          variant="ghost"
          iconLeft="chevron-left"
          onClick={() => navigate('/reports')}
        >
          Reports
        </Button>

        <div className="flex min-w-0 items-center gap-2">
          {/*
            The title is an input, not a heading with a pencil beside it.

            The artboard draws a pencil, and the pencil is a click that buys
            nothing: the field is already the affordance, and a report whose
            name is the sentence its binding describes is the common case —
            typing over it should cost one click, not two.
          */}
          <Input
            value={draft.title}
            onChange={(e) => {
              setDraft((d) => ({ ...d, title: e.target.value }));
              setSaved(false);
            }}
            placeholder={describeBinding(binding)}
            aria-label="Report title"
            style={{ minWidth: 260 }}
          />
          {saved ? <Chip tone="success">Saved</Chip> : <Chip>Draft</Chip>}
        </div>

        <div className="ms-auto flex items-center gap-2">
          <Button
            size="control"
            variant="outline"
            disabled={!canSave}
            onClick={() => commit()}
          >
            Save to library
          </Button>

          {/*
            Saving is part of adding, not a step before it.

            Placing a report on a board that is not in the library would leave
            a tile whose spec exists nowhere — so this does both, and says so.
          */}
          <ActionMenu
            label="Add to dashboard"
            items={boardOptions().map((b) => ({
              id: b.id,
              label: b.name,
              onSelect: () => {
                const report = commit();
                addToDashboard(b.id, report.id);
                navigate(`/dashboards/${b.id}`);
              },
            }))}
            trigger={
              <Button size="control" iconRight="chevron-down" disabled={!canSave}>
                Add to dashboard
              </Button>
            }
          />
        </div>
      </div>

      <div className="rw-builder">
        {/* ================= fields ================= */}
        <aside className="rw-builder-fields flex flex-col gap-3 bg-surface p-4">
          <div>
            <p className="font-display text-base font-bold text-ink">Fields</p>
            <p className="mt-1 text-sm leading-snug text-ink-3">
              Click a field to place it, or drag it into a slot. Ed calls these the individual
              facts.
            </p>
          </div>

          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery('')}
            placeholder="Search fields"
            aria-label="Search fields"
          />

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <FieldGroup
              heading="Dimensions · group by"
              items={DIMENSIONS.filter((d) => matches(d.label, d.blurb, query)).map((d) => ({
                key: d.key,
                label: d.label,
                blurb: d.blurb,
                icon: d.isTime ? 'calendar' : 'grip',
                badge: d.isTime ? 'date' : undefined,
                active: binding.x === d.key || binding.breakdown === d.key,
              }))}
              kind="dimension"
              onPlace={place}
            />

            <FieldGroup
              heading="Measures · aggregate"
              items={MEASURES.filter((m) => matches(m.label, m.blurb, query)).map((m) => ({
                key: m.key,
                label: m.label,
                blurb: m.blurb,
                icon: m.targetOnly ? 'flag' : 'insight',
                badge: m.targetOnly ? 'target' : undefined,
                active: binding.y.some((b) => b.key === m.key) || binding.targetOf === m.key,
              }))}
              kind="measure"
              onPlace={place}
            />
          </div>
        </aside>

        {/* ================= preview ================= */}
        <section className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-ink-2">Preview</p>
            {/*
              The size claim is exact about the half it can be exact about.

              Height is real: rows are a fixed pixel height, so this box is the
              height the tile will have. Width is the shape's column span,
              shown at up to its true width on a 1440 board — the panel is
              narrower than a board, so it is capped rather than overstated.
              `tileSizePx` computes both from the grid's own constants.
            */}
            <p className="text-sm text-ink-3">
              {def.size.def[0]} × {def.size.def[1]} on the dashboard grid — shown at its real
              height
            </p>

            <SegmentedControl<'chart' | 'table'>
              className="ms-auto"
              label="How to preview it"
              value={view}
              onValueChange={setView}
              segments={[
                { value: 'chart', label: 'Chart' },
                { value: 'table', label: 'Table' },
              ]}
            />
          </div>

          <PreviewSlot type={draft.type}>
            <ReportWidget
              /* The SAME component the dashboard renders, so the preview
                 cannot flatter the tile. One renderer, four callers. */
              /*
               * ⚠️ `h-full` is not decoration. The library gives a tile its
               * height through `.rw-grid .rw-tile > .rw-tile-card`, which is
               * scoped to the GRID — and the builder has no grid above it. So
               * the frame collapsed to its content and the plot rendered at
               * zero height: a widget with a title, a legend and a coverage
               * line, and no chart between them.
               */
              className="h-full"
              report={{ ...draft, title }}
              /* The table view is the same spec drawn as a different shape,
                 which is the product's whole premise demonstrated in a
                 toggle — not a second data path. */
              type={view === 'table' ? 'table' : draft.type}
              rows={rows}
              allRows={rows}
              range={filters.range}
              partialPeriod={filters.range.partial ? filters.range.covered : undefined}
              fill
            />
          </PreviewSlot>

          {/* ---- the constraint table talking ---- */}
          {!fit.ok ? (
            <Callout tone="warning">
              <p className="font-semibold">{fit.reason}</p>
              {fit.fix && <p className="mt-0.5">{fit.fix}</p>}
            </Callout>
          ) : fit.caveat ? (
            <Callout tone="info">
              <p className="font-semibold">{fit.caveat}</p>
              {fit.fix && <p className="mt-0.5">{fit.fix}</p>}
            </Callout>
          ) : binding.y.length === 0 ? (
            <Callout tone="info">
              <p className="font-semibold">Nothing is measured yet.</p>
              <p className="mt-0.5">
                Click a measure on the left — {def.label.toLowerCase()} needs{' '}
                {def.accepts.measures.min === 1 ? 'one' : def.accepts.measures.min}.
              </p>
            </Callout>
          ) : null}

          <p className="mt-auto flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
            <Icon name="info" size={14} className="shrink-0" />
            This report is a saved{' '}
            <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-ink-2">
              {'{ type, binding, options }'}
            </code>{' '}
            — the same object the copilot writes when it answers with a chart.
          </p>
        </section>

        {/* ================= binding shelf ================= */}
        <aside className="rw-builder-shelf flex flex-col bg-surface">
          <div className="border-b border-border-subtle p-4">
            <p className="font-display text-base font-bold text-ink">Shape</p>
            <WidgetPicker
              className="mt-2.5"
              variant="compact"
              value={draft.type}
              shape={shapeDesc}
              onPick={(type: WidgetTypeId) => {
                setDraft((d) => ({ ...d, type }));
                setSaved(false);
              }}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
            {def.accepts.dimensions.max > 0 && (
              <Slot
                heading="Group by"
                tone="accent"
                accepts="dimension"
                onDrop={(p) => place(p, 'x')}
                value={binding.x ? findDimension(binding.x)?.label : undefined}
                onClear={() => patch({ x: null })}
                empty="Drop a dimension, or click one"
              />
            )}

            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink-2">
                {def.accepts.measures.max > 1 ? 'Measures' : 'Measure'}
              </p>
              <div className="flex flex-col gap-1.5">
                {binding.y.map((bound) => {
                  const field = findMeasure(bound.key);
                  if (!field) return null;
                  return (
                    <div
                      key={bound.key}
                      className="flex items-center gap-2 rounded-md border border-accent bg-selected px-2.5 py-1.5"
                    >
                      <Icon name="insight" size={13} className="shrink-0 text-selected-ink" />
                      <span className="min-w-0 flex-1 truncate text-base font-semibold text-selected-ink">
                        {field.label}
                      </span>

                      {/*
                        The aggregation lives ON the bound measure, because it
                        is part of what was bound — "average turnaround" and
                        "longest turnaround" are two different facts about one
                        field. `field.aggs` is what the catalogue permits, so
                        summing a rate is not offered rather than offered and
                        wrong.
                      */}
                      {field.aggs.length > 1 ? (
                        <Select
                          value={bound.agg}
                          aria-label={`How to aggregate ${field.label}`}
                          onChange={(e) =>
                            patch({
                              y: binding.y.map((m) =>
                                m.key === bound.key
                                  ? { ...m, agg: e.target.value as Aggregation }
                                  : m
                              ),
                            })
                          }
                          className="w-auto min-w-0 py-0 text-sm" style={{ height: 28 }}
                        >
                          {field.aggs.map((a) => (
                            <option key={a} value={a}>
                              {AGG_FULL[a]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-sm font-semibold text-selected-ink">
                          {AGG_FULL[bound.agg]}
                        </span>
                      )}

                      <button
                        type="button"
                        aria-label={`Remove ${field.label}`}
                        onClick={() => patch({ y: binding.y.filter((m) => m.key !== bound.key) })}
                        className="shrink-0 rounded-sm text-selected-ink focus-visible:shadow-[var(--rw-ring)] focus-visible:outline-none"
                      >
                        <Icon name="close" size={13} strokeWidth={2.2} />
                      </button>
                    </div>
                  );
                })}

                {binding.y.length < def.accepts.measures.max && (
                  <DropZone
                    accepts="measure"
                    onDrop={(p) => place(p)}
                    label={
                      binding.y.length === 0
                        ? 'Drop a measure, or click one'
                        : 'Add another measure'
                    }
                  />
                )}
              </div>
            </div>

            {/* A control that does not apply is ABSENT. The target slot appears
                when the shape needs one — or when one is already bound, so a
                saved report is never missing its own field. */}
            {(def.accepts.requiresTarget || binding.targetOf) && (
              <Slot
                heading="Target"
                tone="success"
                accepts="measure"
                onDrop={(p) => place(p, 'target')}
                value={binding.targetOf ? findMeasure(binding.targetOf)?.label : undefined}
                onClear={() => patch({ targetOf: null })}
                empty="Drop a goal to judge it against"
              />
            )}

            {(takesBreakdown || binding.breakdown) && (
              <Slot
                heading="Breakdown"
                tone="accent"
                accepts="dimension"
                onDrop={(p) => place(p, 'breakdown')}
                value={binding.breakdown ? findDimension(binding.breakdown)?.label : undefined}
                onClear={() => patch({ breakdown: null })}
                empty={
                  def.accepts.breakdown === 'required'
                    ? 'Required · drop a dimension'
                    : 'Optional · drop a dimension'
                }
              />
            )}

            <Filters binding={binding} patch={patch} />

            <div className="mt-auto flex items-center gap-2.5 border-t border-border-subtle pt-3.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-selected text-selected-ink">
                <Icon name="ai" size={16} />
              </span>
              <p className="text-sm leading-snug text-ink-2">
                <button
                  type="button"
                  onClick={() => navigate('/chat')}
                  className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Or describe it
                </button>{' '}
                — “average turnaround by category against target”.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================================
   Parts
   ========================================================================== */

const matches = (label: string, blurb: string, q: string) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return label.toLowerCase().includes(needle) || blurb.toLowerCase().includes(needle);
};

/**
 * The preview's box.
 *
 * Height from the grid's real row height; width capped at the shape's true
 * span on a 1440-wide board so the claim in the caption stays true. A widget
 * previewed at panel width would size its container queries to a width the
 * dashboard never gives it — which is the Storybook-canvas mistake in
 * TRAPS §4, one repo along.
 */
const REFERENCE_BOARD_WIDTH = 1120;

function PreviewSlot({ type, children }: { type: WidgetTypeId; children: React.ReactNode }) {
  const [w, h] = widgetSize(type).def;
  const size = tileSizePx(w, h, REFERENCE_BOARD_WIDTH);

  return (
    <div style={{ width: '100%', maxWidth: size.width, height: size.height }}>{children}</div>
  );
}

interface FieldItem {
  key: string;
  label: string;
  blurb: string;
  icon: 'calendar' | 'grip' | 'insight' | 'flag';
  badge?: string;
  active?: boolean;
}

function FieldGroup({
  heading,
  items,
  kind,
  onPlace,
}: {
  heading: string;
  items: FieldItem[];
  kind: DragPayload['kind'];
  onPlace: (p: DragPayload) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="px-1 pb-1 text-sm font-semibold text-ink-3">{heading}</h3>
      {items.map((f) => (
        <button
          key={f.key}
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind, key: f.key }));
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => onPlace({ kind, key: f.key })}
          title={f.blurb}
          className={
            f.active
              ? 'flex cursor-grab items-center gap-2 rounded-sm bg-selected px-2 py-1.5 text-start text-base font-semibold text-selected-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
              : 'flex cursor-grab items-center gap-2 rounded-sm px-2 py-1.5 text-start text-base font-medium text-ink-2 hover:bg-surface-1 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
          }
        >
          <Icon name={f.icon} size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{f.label}</span>
          {f.badge && (
            <span className="shrink-0 rounded-pill bg-surface-2 px-1.5 text-sm font-semibold text-ink-3">
              {f.badge}
            </span>
          )}
        </button>
      ))}
    </section>
  );
}

/** A bound slot, or an invitation to fill it. */
function Slot({
  heading,
  tone,
  accepts,
  onDrop,
  value,
  onClear,
  empty,
}: {
  heading: string;
  tone: 'accent' | 'success';
  accepts: DragPayload['kind'];
  onDrop: (p: DragPayload) => void;
  value?: string;
  onClear: () => void;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink-2">{heading}</p>
      {value ? (
        <div
          className={
            tone === 'success'
              ? 'flex items-center gap-2 rounded-md border border-success bg-success-soft px-2.5 py-1.5'
              : 'flex items-center gap-2 rounded-md border border-accent bg-selected px-2.5 py-1.5'
          }
        >
          <Icon
            name={tone === 'success' ? 'flag' : 'grip'}
            size={13}
            className={tone === 'success' ? 'shrink-0 text-success' : 'shrink-0 text-selected-ink'}
          />
          <span
            className={
              tone === 'success'
                ? 'min-w-0 flex-1 truncate text-base font-semibold text-success'
                : 'min-w-0 flex-1 truncate text-base font-semibold text-selected-ink'
            }
          >
            {value}
          </span>
          <button
            type="button"
            aria-label={`Clear ${heading}`}
            onClick={onClear}
            className={
              tone === 'success'
                ? 'shrink-0 rounded-sm text-success focus-visible:shadow-[var(--rw-ring)] focus-visible:outline-none'
                : 'shrink-0 rounded-sm text-selected-ink focus-visible:shadow-[var(--rw-ring)] focus-visible:outline-none'
            }
          >
            <Icon name="close" size={13} strokeWidth={2.2} />
          </button>
        </div>
      ) : (
        <DropZone accepts={accepts} onDrop={onDrop} label={empty} />
      )}
    </div>
  );
}

/**
 * An empty slot that accepts a drop.
 *
 * It highlights only for a payload it can take, so dragging a measure over
 * `Group by` says no before the drop rather than after — the answer arrives
 * while the user can still change their mind.
 */
function DropZone({
  accepts,
  onDrop,
  label,
}: {
  accepts: DragPayload['kind'];
  onDrop: (p: DragPayload) => void;
  label: string;
}) {
  const [over, setOver] = useState(false);

  const read = (e: React.DragEvent): DragPayload | null => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  };

  return (
    <div
      onDragOver={(e) => {
        /* `types` rather than `getData`, which browsers deliberately blank
           during dragover — reading it here returns "" and the zone would
           never light up. */
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const payload = read(e);
        if (payload && payload.kind === accepts) onDrop(payload);
      }}
      className={
        over
          ? 'rw-slot-min flex items-center justify-center rounded-md border border-dashed border-accent bg-selected px-2.5 py-1.5 text-base text-selected-ink'
          : 'rw-slot-min flex items-center justify-center rounded-md border border-dashed border-border px-2.5 py-1.5 text-base text-ink-3'
      }
    >
      {label}
    </div>
  );
}

/**
 * Filters saved WITH the report — tier three of the three.
 *
 * The sentence underneath is the important part: organization and date are
 * asked once in the header and are deliberately not here. Without it a user
 * looks for them, does not find them, and concludes the builder is missing
 * something.
 */
function Filters({
  binding,
  patch,
}: {
  binding: ReportBinding;
  patch: (next: Partial<ReportBinding>) => void;
}) {
  const active = Object.entries(binding.filters).filter(([, v]) => v.length > 0);
  const unused = DIMENSIONS.filter((d) => !binding.filters[d.key]?.length);

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink-2">Filters on this report</p>

      <div className="flex flex-col gap-1.5">
        {active.map(([key, values]) => {
          const dim = findDimension(key);
          if (!dim) return null;
          const options = dimensionValues(dim, ORDERS);
          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface px-2.5 py-1.5"
            >
              <span className="shrink-0 text-base text-ink-3">{dim.label}</span>
              <Select
                value={values[0]}
                aria-label={`${dim.label} filter`}
                onChange={(e) =>
                  patch({ filters: { ...binding.filters, [key]: [e.target.value] } })
                }
                className="ms-auto w-auto min-w-0 py-0 text-sm" style={{ height: 28 }}
              >
                {options.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                aria-label={`Remove the ${dim.label} filter`}
                onClick={() => {
                  const next = { ...binding.filters };
                  delete next[key];
                  patch({ filters: next });
                }}
                className="shrink-0 rounded-sm text-ink-3 focus-visible:shadow-[var(--rw-ring)] focus-visible:outline-none"
              >
                <Icon name="close" size={13} strokeWidth={2.2} />
              </button>
            </div>
          );
        })}

        {unused.length > 0 && (
          <Select
            value=""
            aria-label="Add a filter"
            onChange={(e) => {
              const dim = findDimension(e.target.value);
              if (!dim) return;
              /* Seeded with the first real value rather than left empty: an
                 empty filter list means NO filter in the resolver, so an
                 unseeded row would be a control that appears to do nothing. */
              const first = dimensionValues(dim, ORDERS)[0];
              patch({ filters: { ...binding.filters, [dim.key]: first ? [first] : [] } });
            }}
          >
            <option value="">Add a filter…</option>
            {unused.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      <p className="mt-2 text-sm leading-snug text-ink-3">
        Organization and date come from the header and are not saved here — one question, asked
        once.
      </p>
    </div>
  );
}
