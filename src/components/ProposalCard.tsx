import { useRef, type FormEvent } from 'react';
import { Button, Callout, ChatThinking, Chip, Icon, Input, OptionCard } from '@realwired/ui';

import { readback } from '../lib/compose';
import type { ProposalTurn } from '../lib/thread';

/* ============================================================================
   The proposal — a board, offered, named and built without leaving the chat.

   ⭐ It is a CHECKLIST, not a configurator, and holding that line is most of
   the design. No field pickers, no chart-type menus, no date control: those
   exist in the builder and on the board itself, and duplicating them here
   would make the fast path slower than the one it replaces. Untick, name,
   create.

   ## ⚠️ Why the name is IN here, and not in a dialog

   It was `DashboardNameDialog` until 17 Sept, and a screenshot of that is the
   clearest argument against it: a modal sat over the drawer with its own
   `Create dashboard` button while the card behind it still showed the SAME
   button, and the modal's scrim dimmed the board — over a panel that is
   non-modal precisely so the board stays readable. Two buttons with one name,
   and a flow that interrupted itself to ask one question.

   A conversation should not open a dialog to ask something it could just ask.
   So the name is a field in the card, the button next to it is the only
   `Create dashboard` on screen, and Enter works because it is a real form.

   `DashboardNameDialog` is still right where it is still used — `＋ New
   dashboard`, Duplicate, Rename. Those are not happening inside a
   conversation, so a dialog is the correct interruption.

   ## The four states are the history

   `open → building → created`, and each one REPLACES the last IN PLACE rather
   than the card vanishing and a fresh message appearing. That is deliberate:
   the transcript is a record, and a proposal that disappeared the moment it
   was accepted would leave the reader scrolled past a question with no visible
   answer. The settled card keeps what was chosen, so the conversation still
   shows what the board was made of.
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
  onRename: (name: string) => void;
  onCreate: () => void;
  onDismiss: () => void;
  /** Go to the board this proposal made. Only ever called once it exists. */
  onOpenBoard: (boardId: string) => void;
}

export function ProposalCard({
  turn,
  onToggle,
  onRename,
  onCreate,
  onDismiss,
  onOpenBoard,
}: ProposalCardProps) {
  const { candidates, parsed } = turn.composition;
  const chosen = turn.selected.length;
  const named = turn.name.trim();

  const nameRef = useRef<HTMLInputElement>(null);
  const fieldId = `rw-proposal-name-${turn.id}`;

  /** The widgets actually chosen, in the order they were proposed. */
  const kept = candidates.filter((c) => turn.selected.includes(c.report.id));

  /* ---- declined ----
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

  const settled = turn.status === 'building' || turn.status === 'created';

  /* ---- building, and built ----
     One block for both, because they are the same card a moment apart: the
     list of what is on the board does not change between them, only the line
     underneath it. Rendering them as two components would animate the list out
     and back in for no reason. */
  if (settled) {
    return (
      <div className="flex flex-col gap-3">
        {/* ⭐ The board's own glyph, beside its name. The same mark that is now
            in the rail, so the thing the copilot just made is recognisable as
            the row that appeared — which is the beat this card exists for.
            Only once it EXISTS: while building there is no board to have a
            glyph yet. */}
        <p className="flex items-center gap-2 text-md text-ink-2">
          {turn.board?.icon && (
            <Icon name={turn.board.icon} size={17} strokeWidth={2} className="text-ink" aria-hidden />
          )}
          <span>
            {turn.status === 'building' ? 'Making' : 'Made'}{' '}
            <strong>{turn.board?.name ?? named}</strong> — {kept.length} report
            {kept.length === 1 ? '' : 's'}.
          </span>
        </p>

        {/* What went on it. Read-only, and kept in the transcript on purpose:
            this is the record of what the board was made of, and scrolling back
            to it later is the only way to answer "what did I pick?". */}
        <ul className="flex flex-col gap-1.5">
          {kept.map((c) => (
            <li
              key={c.report.id}
              className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-surface-1 px-3 py-2"
            >
              <Icon name="check" size={14} className="shrink-0 text-success" />
              <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
                {c.report.title}
              </span>
              <Chip tone="neutral">{SHAPE_LABEL[c.report.type] ?? c.report.type}</Chip>
            </li>
          ))}
        </ul>

        {turn.status === 'building' ? (
          /* The same beat an answer uses. `ProgressStages` is the library's
             other option and its own note rules it out — it is for waits over
             roughly ten seconds, and this is milliseconds of real work. A
             named sequence here would be inventing a wait. */
          <ChatThinking label="Saving the reports and arranging the dashboard" />
        ) : (
          <Callout
            tone="success"
            action={
              turn.board && (
                <Button variant="tonal" size="sm" onClick={() => onOpenBoard(turn.board!.id)}>
                  Open it
                </Button>
              )
            }
          >
            Ready, and in your rail. Each widget is saved to your reports too.
          </Callout>
        )}
      </div>
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
            <strong>One part of that I cannot do yet:</strong> {parsed.unmet.join('; ')}.
          </span>
        </Callout>
      )}

      {/* What was deliberately left off. Under the caveat and above the list:
          it explains an absence the reader is about to look at. */}
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
        Name and create, as one form.

        A real `<form>` so Enter submits from the field — the keyboard path a
        one-field step should have, and the thing the dialog used to provide.
        The name is pre-filled from what the request parsed to, so the common
        case is pressing the button; it is a readback as much as a field.
      */}
      <form
        className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-3.5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!named || chosen === 0) return;
          onCreate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="text-base font-semibold text-ink">
            Name this dashboard
          </label>
          <Input
            id={fieldId}
            ref={nameRef}
            value={turn.name}
            placeholder="Northgate QBR"
            autoComplete="off"
            maxLength={60}
            onChange={(e) => onRename(e.target.value)}
          />
        </div>

        {/*
          One `Create dashboard`, and it is here — beside the name it will use.

          ⚠️ Disabled rather than hidden, with the reason in the count beside
          it. The two ways this form can be wrong are an empty name and nothing
          ticked, and a button that will not work should say so before it is
          pressed rather than after.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={chosen === 0 || !named}>
            Create dashboard
          </Button>
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Not now
          </Button>
          <span className="rw-numeric ms-auto text-md text-ink-3">
            {chosen} of {candidates.length} selected
          </span>
        </div>
      </form>

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
