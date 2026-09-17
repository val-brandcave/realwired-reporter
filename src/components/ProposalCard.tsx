import { Button, Callout, Chip, Icon, OptionCard } from '@realwired/ui';

import { readback } from '../lib/compose';
import type { ProposalTurn } from '../lib/thread';

/* ============================================================================
   The proposal — a board, offered as a checklist.

   ⭐ It is a CHECKLIST, not a configurator, and holding that line is most of
   the design. No field pickers, no chart-type menus, no date control: those
   exist in the builder and on the board itself, and duplicating them here
   would make the fast path slower than the one it replaces. The reader could
   already add widgets one at a time from the rail — this only earns its place
   by being quicker than that. Untick, name, create.

   Every part is the library's: `OptionCard` is the row (Parachute's confirm
   gate, `type="checkbox"`), `Chip` the shape, `Callout` the caveat, `Button`
   the two actions. This file is an assembly, which is the only thing
   `src/components` is allowed to hold.

   ## Why the shape is on every row

   A board is a composition, and the reader is being asked to approve one
   before it exists. "Three figures, two charts and a table" is the sentence
   they need in order to picture it, and the only way to give them that
   sentence is to put the shape on each row and let them read down the column.
   Without it the list is seven titles and the composition is a surprise.
   ========================================================================== */

/** What a reader calls each shape. The registry's ids are ours, not theirs. */
const SHAPE_LABEL: Record<string, string> = {
  stat: 'figure',
  dial: 'gauge',
  bar: 'bars',
  hbar: 'bars',
  line: 'trend',
  area: 'trend',
  combo: 'trend',
  donut: 'share',
  target: 'vs target',
  distribution: 'spread',
  durations: 'durations',
  heatmap: 'grid',
  table: 'table',
};

export interface ProposalCardProps {
  turn: ProposalTurn;
  onToggle: (reportId: string) => void;
  onCreate: () => void;
  onDismiss: () => void;
  /** Go to the board this proposal made. Only ever called once it exists. */
  onOpenBoard: (boardId: string) => void;
}

export function ProposalCard({
  turn,
  onToggle,
  onCreate,
  onDismiss,
  onOpenBoard,
}: ProposalCardProps) {
  const { candidates, parsed } = turn.composition;
  const chosen = turn.selected.length;

  /* ---- settled: the board exists ---- */
  if (turn.status === 'created' && turn.board) {
    const { id, name, widgets } = turn.board;
    return (
      /* `action` rather than a button in the body: Callout's own layout is a
         row with one control on the trailing edge, and its `tonal` Button
         inherits the tone through `--rw-btn-tone`. The pair was designed
         together — see the handshake note on the component. */
      <Callout
        tone="success"
        action={
          <Button variant="tonal" size="sm" onClick={() => onOpenBoard(id)}>
            Open it
          </Button>
        }
      >
        <strong>{name}</strong> is ready — {widgets} widget{widgets === 1 ? '' : 's'} added, and
        each one saved to your reports.
      </Callout>
    );
  }

  /* ---- settled: declined ----
     A line rather than nothing. A checklist that vanished would leave the
     transcript showing a question with no answer, and the reader wondering
     whether they dismissed it or it failed. */
  if (turn.status === 'dismissed') {
    return (
      <p className="text-md text-ink-3">
        No board made. Ask again whenever you want one — nothing was saved.
      </p>
    );
  }

  /* ---- open ---- */
  return (
    <div className="flex flex-col gap-4">
      <p className="text-md text-ink-2">
        {readback(parsed)} Here is what I would put on it — untick anything you do not want.
      </p>

      {/* What was understood but could not be honoured. Above the list, because
          it changes whether the list is the right list at all. */}
      {parsed.unmet.length > 0 && (
        <Callout tone="warning">
          <span>
            <strong>One part of that I cannot do yet:</strong>{' '}
            {parsed.unmet.join('; ')}.
          </span>
        </Callout>
      )}

      {/* What was deliberately left off. Under the list rather than above it:
          `unmet` changes whether the list is the right list at all, which is a
          reason to read before choosing; this explains an absence, which is
          only a question once you have looked. */}
      {parsed.notes.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-ink-3">
          <Icon name="info" size={13} className="mt-0.5 shrink-0" />
          <span>{parsed.notes.join('. ')}.</span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        {candidates.map((c) => (
          <OptionCard
            key={c.report.id}
            type="checkbox"
            checked={turn.selected.includes(c.report.id)}
            onChange={() => onToggle(c.report.id)}
            label={c.report.title}
            description={c.why}
            meta={<Chip tone="neutral">{SHAPE_LABEL[c.report.type] ?? c.report.type}</Chip>}
          />
        ))}
      </div>

      {/*
        The count and the two actions.

        ⚠️ The primary is DISABLED at zero rather than hidden, and it says what
        it will do rather than "OK": the row in the rail says New dashboard,
        this says Create dashboard, and the board you land on is the one you
        just named. An empty board made by mistake is the one outcome this card
        can produce that nobody wants, and a button that will not work should
        say so before it is pressed — the same call `DashboardNameDialog`
        already makes on its own name field.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onCreate} disabled={chosen === 0}>
          Create dashboard
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
        <span className="rw-numeric ms-auto text-md text-ink-3">
          {chosen} of {candidates.length} selected
        </span>
      </div>

      {/* Said once, here, for the same reason the chat page says its answers
          are scripted: a surface that quietly implies more than it does is the
          only thing on this screen that could actually mislead. */}
      <p className="flex items-start gap-1.5 text-sm text-ink-3">
        <Icon name="info" size={13} className="mt-0.5 shrink-0" />
        <span>
          These are real widget specs over your own orders, picked from your report library —
          not examples. You can change any of them on the board afterwards.
        </span>
      </p>
    </div>
  );
}
