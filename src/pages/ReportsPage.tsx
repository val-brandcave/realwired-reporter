import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Icon,
  PageBody,
  PageHeader,
  SearchInput,
  Select,
  Tabs,
  WIDGET_DEFINITIONS,
  WIDGET_LIST,
  type WidgetTypeId,
} from '@realwired/ui';

import { ReportCard } from '../components/ReportCard';
import { useReports } from '../lib/library';

/* ============================================================================
   The report library.

   ⭐ §2.4 of the plan, made visible: a report and a widget are the SAME
   object. So this screen is not a list of documents — it is the set of bound
   specs the product can draw, and every one of them can go onto a dashboard,
   be opened in the builder, or be written by the copilot. Three entry points,
   one mechanism.

   Built to the approved `Reports` artboard: search, the origin tabs, a shape
   filter, the count, `New report`, and a four-up grid of cards ending in a
   dashed one. Every visual value comes from the tokens.
   ========================================================================== */

/**
 * The four filters, in the artboard's own words.
 *
 * `ai` is labelled "Made by chat" rather than "AI" because that is what the
 * client calls it and because it describes where it came from rather than what
 * made it — which is the fact a reader wants.
 */
const TABS = [
  { value: 'all', label: 'All' },
  { value: 'starter', label: 'Starter' },
  { value: 'ai', label: 'Made by chat' },
  { value: 'user', label: 'Yours' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export function ReportsPage() {
  const reports = useReports();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabValue>('all');
  const [query, setQuery] = useState('');
  const [shape, setShape] = useState<WidgetTypeId | ''>('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      if (tab !== 'all' && r.origin !== tab) return false;
      if (shape && r.type !== shape) return false;
      if (!q) return true;
      /*
       * Title, tag AND shape label — because "donut" is a thing people type
       * into this box, and a search that only reads titles answers it with
       * nothing while three donuts sit on screen.
       */
      return (
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        WIDGET_DEFINITIONS[r.type].label.toLowerCase().includes(q)
      );
    });
  }, [reports, tab, shape, query]);

  /* Only shapes that something in the library actually uses. A filter offering
     `scatter` when no report is one is a control that can only disappoint. */
  const shapesInUse = useMemo(() => {
    const used = new Set(reports.map((r) => r.type));
    return WIDGET_LIST.filter((d) => used.has(d.id));
  }, [reports]);

  const counts = useMemo(() => {
    const by = { all: reports.length, starter: 0, ai: 0, user: 0 };
    for (const r of reports) by[r.origin] += 1;
    return by;
  }, [reports]);

  const narrowed = filtered.length !== reports.length;

  return (
    <>
      <PageHeader
        title="Reports"
        /* No description. Val's call, 10 Sept — the cards below say what they
           are, and a line under the title restating the page's own name is a
           row the eye learns to skip. */
        actions={
          <Button size="control" iconLeft="add" onClick={() => navigate('/reports/new')}>
            New report
          </Button>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="Search by name, shape or tag…"
              aria-label="Search reports"
              className="flex-1"
              /* `Select` below carries `w-full` from the library, so it fills
                 whatever flex line it lands on. Measured: an unbounded search
                 field took 1202px of a 1617px row, wrapped the shape filter to
                 its own line, and it then stretched to the full width. Capping
                 the search keeps the toolbar one row. */
              style={{ minWidth: 240, maxWidth: 420 }}
            />

            <Tabs
              label="Where the report came from"
              value={tab}
              onValueChange={setTab}
              tabs={TABS.map((t) => ({
                value: t.value,
                label: t.label,
                count: counts[t.value],
              }))}
            />

            <Select
              value={shape}
              onChange={(e) => setShape(e.target.value as WidgetTypeId | '')}
              aria-label="Filter by shape"
              /* Explicit width, because `w-full` is in the component's own
                 class list and only an inline style outranks it. */
              style={{ width: 180, flex: 'none' }}
            >
              <option value="">Any shape</option>
              {shapesInUse.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>

            {/*
              The count is a pair when it is narrowed and a single figure when
              it is not. "18 of 18" is the artboard's wording and it is right
              while a filter is on; printed unconditionally it reads as though
              something is being withheld.
            */}
            <p className="rw-numeric shrink-0 text-sm text-ink-3">
              {narrowed ? `${filtered.length} of ${reports.length}` : `${reports.length} reports`}
            </p>
          </div>

          {filtered.length === 0 ? (
            /* An empty result names the two moves that get out of it, in the
               order they are likely: widen, or build the thing you wanted. */
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
              <p className="text-base text-ink-2">
                Nothing here matches {query ? `“${query}”` : 'those filters'}.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="control"
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setShape('');
                    setTab('all');
                  }}
                >
                  Clear the filters
                </Button>
                <Button size="control" iconLeft="add" onClick={() => navigate('/reports/new')}>
                  Build it instead
                </Button>
              </div>
            </div>
          ) : (
            /*
              Four up at full width, and it steps down rather than reflowing to
              a single column — a card at 1100px wide is a header with a
              horizon of whitespace.
            */
            <div className="rw-card-grid">
              {filtered.map((r) => (
                <ReportCard key={r.id} report={r} onOpen={() => navigate(`/reports/${r.id}`)} />
              ))}

              {/*
                The dashed cell is part of the grid, not a button above it.

                It puts "make one" where the eye already is after reading the
                set — which is the moment somebody discovers the library does
                not have what they came for. The artboard puts it last for the
                same reason.
              */}
              <button
                type="button"
                onClick={() => navigate('/reports/new')}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-transparent p-4 text-center transition-colors duration-100 hover:border-accent hover:bg-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                style={{ minHeight: 168 }}
              >
                <span className="grid size-9 place-items-center rounded-sm bg-selected text-selected-ink">
                  <Icon name="add" size={18} strokeWidth={2.2} />
                </span>
                <span className="font-display text-base font-bold text-ink">New report</span>
                <span className="text-sm leading-snug text-ink-3" style={{ maxWidth: '22ch' }}>
                  Pick a shape, then drop in a grouping and a measure.
                </span>
              </button>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
