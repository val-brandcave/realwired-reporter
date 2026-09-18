import { useMemo, useState } from 'react';
import {
  Chip,
  Icon,
  SearchInput,
  SegmentedControl,
  Sheet,
  WIDGET_DEFINITIONS,
  WidgetPicker,
  shapeIcon,
  type WidgetTypeId,
} from '@realwired/ui';

import { useReports } from '../lib/library';
import type { Report } from '../lib/reports';

/*
 * ⚠️ There used to be a `SHAPE_ICON` map here, copied out of `WidgetPicker`.
 * It was the second source of truth the registry exists to end — a shape added
 * to the design system would have had a glyph in the picker and a blank in
 * this rail. The library now exports `shapeIcon`.
 */

type Tab = 'reports' | 'shapes';

export interface AddReportRailProps {
  open: boolean;
  onClose: () => void;
  /** Report ids already on this board — shown as added rather than offered. */
  presentIds: Set<string>;
  onAdd: (reportId: string) => void;
  /** Start a new report from a bare shape, in the builder. */
  onPickShape?: (type: WidgetTypeId) => void;
}

/**
 * Add something to the current dashboard, from a rail beside the board.
 *
 * ## Why a rail and not a dialog
 *
 * ⭐ This is the screen driven live in the demo, and the acceptance criterion is that
 * he can *"jump into a builder session with her and start rearranging things or
 * pulling in new graphs… on the fly."*
 *
 * A modal fails that in a way that is easy to miss until you watch someone use
 * it: it covers the board. Adding a widget is a comparison — you are looking at
 * what is already there while you choose the next thing, and you want to add
 * two or three without the layout disappearing between each one. A dialog makes
 * that a sequence of round trips, each one hiding the thing being changed. A
 * rail leaves the board lit and interactive, so the effect of each add is
 * watchable. That is the difference between demonstrating a product and
 * operating a form.
 *
 * It overlays rather than pushing the board narrower — see the note in
 * `DashboardPage`, where shrinking the grid was measured and truncated four
 * tile titles.
 *
 * ## Two tabs, because they are two different questions
 *
 * **Saved reports** is "a question someone already framed" — one click, and it
 * is the click that carries a live demo. **Shapes** is "I want to build a new
 * one", which is the builder's slower conversation and is offered second.
 *
 * The shapes tab is a render of the library registry rather than a list kept
 * here, so this rail, the report builder and the copilot cannot disagree about
 * which shapes exist. See `WidgetPicker`.
 */
export function AddReportRail({
  open,
  onClose,
  presentIds,
  onAdd,
  onPickShape,
}: AddReportRailProps) {
  const [tab, setTab] = useState<Tab>('reports');
  const [query, setQuery] = useState('');
  /* The LIVE library, so a report built during the call is offerable here the
     moment it is saved. `REPORTS` is only the starter set. */
  const reports = useReports();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...reports].sort((a, b) => a.title.localeCompare(b.title));
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.includes(q)) ||
        WIDGET_DEFINITIONS[r.type].label.toLowerCase().includes(q)
    );
  }, [reports, query]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      side="right"
      size="half"
      /*
       * Non-modal, and this is the whole reason it is a rail.
       *
       * A scrim over the board would hide the thing being changed, and a focus
       * trap would make adding three widgets three round trips. Here the board
       * stays lit and interactive behind the panel — so each add is watchable,
       * which is what a live session with a client needs.
       */
      modal={false}
      title="Add to this dashboard"
      description="The dashboard stays visible behind this — add as many as you like."
      /*
       * The provenance of the picker itself, stated on the surface.
       *
       * It is here because it is the thing a Realwired engineer in the room
       * needs to hear: the list is not a demo fixture. It is the same table the
       * builder and the copilot read, which is why a shape added to the design
       * system shows up in all three without an edit.
       */
      footerStart={
        <p className="text-xs leading-snug text-ink-3">
          Every shape is one entry in the widget registry — the same table the
          report builder and the copilot read.
        </p>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        <SegmentedControl<Tab>
          label="What to add"
          value={tab}
          onValueChange={setTab}
          block
          segments={[
            { value: 'reports', label: `Saved reports (${reports.length})` },
            { value: 'shapes', label: 'Shapes' },
          ]}
        />

        {tab === 'reports' ? (
          <>
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, shape or tag…"
              aria-label="Search saved reports"
            />

            {filtered.length === 0 ? (
              <p className="px-1 py-8 text-center text-sm text-ink-3">
                Nothing matches “{query}”. Try a shape — “table”, “donut” — or a
                tag like “revenue”. Or build a new one from Shapes.
              </p>
            ) : (
              <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
                {filtered.map((r) => (
                  <li key={r.id}>
                    <ReportRow
                      report={r}
                      added={presentIds.has(r.id)}
                      onAdd={() => onAdd(r.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <WidgetPicker
            className="min-h-0"
            onPick={(id) => onPickShape?.(id)}
          />
        )}
      </div>
    </Sheet>
  );
}

/**
 * An added report is marked, not removed.
 *
 * Hiding it makes the list shift under the cursor as you add — and, worse,
 * makes a report you already added look like one that does not exist. A checked
 * row says "you have this".
 */
function ReportRow({
  report,
  added,
  onAdd,
}: {
  report: Report;
  added: boolean;
  onAdd: () => void;
}) {
  const def = WIDGET_DEFINITIONS[report.type];

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={added}
      className="flex w-full items-center gap-3 rounded-md border border-border-subtle bg-surface px-3 py-2.5 text-start transition-colors duration-100 hover:bg-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:bg-surface-1"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2">
        <Icon name={shapeIcon(report.type)} size={17} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{report.title}</span>
        <span className="block truncate text-xs text-ink-3">{def.label}</span>
      </span>

      {report.origin === 'ai' && <Chip tone="accent">AI</Chip>}

      <span
        className={
          added
            ? 'grid size-7 shrink-0 place-items-center text-success'
            : 'grid size-7 shrink-0 place-items-center text-accent'
        }
      >
        <Icon name={added ? 'check' : 'add'} size={17} strokeWidth={2.2} />
      </span>
    </button>
  );
}
