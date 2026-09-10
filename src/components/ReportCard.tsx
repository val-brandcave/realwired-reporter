import { Chip, Icon, WIDGET_DEFINITIONS, shapeIcon } from '@realwired/ui';

import type { Report } from '../lib/reports';

/* ============================================================================
   One report, as a card in the library.

   An assembly, not a library part: it is composed entirely from `Card`-grade
   library primitives (`Chip`, `Icon`, the token utilities) and it has exactly
   one consumer, the reports page. What it must NOT do is invent a visual
   value — every colour, radius and size here resolves to `--rw-*`.

   ⚠️ Written against the approved `Reports` artboard for structure and
   wording, and against the tokens for every value. The artboard draws this
   card with `#ab2225` glyph tiles, `#f4f3f1` tag pills and a 13.5px title;
   none of those numbers appear below, because the artboard was drawn to
   communicate and the design system is what ships. See CLAUDE.md rule 0.
   ========================================================================== */

/** What the badge says, and how loudly. */
const ORIGIN: Record<Report['origin'], { label: string; tone: 'neutral' | 'accent' }> = {
  starter: { label: 'Starter', tone: 'neutral' },
  /*
   * The client's own words for it, and the reason it is the one badge that
   * gets the accent tone: a report a model wrote is the one a reader is
   * entitled to be suspicious of. Marking it is the same discipline as the
   * `demo` chip — the provenance of a figure travels with the figure.
   */
  ai: { label: 'Made by chat', tone: 'accent' },
  user: { label: 'Yours', tone: 'neutral' },
};

export interface ReportCardProps {
  report: Report;
  /** Open it in the builder. */
  onOpen: () => void;
}

export function ReportCard({ report, onOpen }: ReportCardProps) {
  const def = WIDGET_DEFINITIONS[report.type];
  const origin = ORIGIN[report.origin];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4 text-start shadow-elev-1 transition-colors duration-100 hover:border-accent hover:bg-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="flex items-start gap-2.5">
        {/* The silhouette comes from the registry, so a shape added to the
            design system is drawn here without an edit. */}
        <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-selected text-selected-ink">
          <Icon name={shapeIcon(report.type)} size={18} />
        </span>
        <span className="ms-auto flex shrink-0 items-center gap-1.5">
          {def.isNew && <Chip tone="info">New shape</Chip>}
          <Chip tone={origin.tone}>{origin.label}</Chip>
        </span>
      </div>

      <div className="min-w-0">
        {/*
          Two lines, not one, and the second is the SHAPE.

          It is the fact the artboard's own subtitle carries, and it is the one
          a reader needs before opening anything: "Turnaround by category vs
          SLA" does not say whether it is a chart or a table. Naming the shape
          is also what makes the library legible as a set of ~15 shapes in
          different configurations rather than 18 unrelated screens.
        */}
        <p className="font-display text-base font-bold leading-snug text-ink">{report.title}</p>
        <p className="mt-0.5 text-sm text-ink-3">{def.label}</p>
      </div>

      {report.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-pill bg-surface-2 px-2 py-0.5 text-sm font-medium text-ink-2"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/*
        The footer is PROVENANCE, which is why it survives into a card this
        small while the blurb does not.

        The blocker on this product is confidence rather than features, so "what does this
        count" beats "what does this show" everywhere in this product. The noun
        is the report's own `noun` — the same string the coverage line uses on
        the rendered widget, so the card and the widget cannot describe
        different denominators.
      */}
      <p className="mt-auto flex items-center gap-1.5 border-t border-border-subtle pt-2.5 text-sm text-ink-3">
        <Icon name="check-circle" size={13} className="shrink-0" />
        <span className="truncate">Counts {report.noun ?? 'orders'}</span>
      </p>
    </button>
  );
}
