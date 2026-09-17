import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Callout,
  ChatAction,
  ChatMessage,
  ChatOpener,
  ChatSuggestions,
  ChatThinking,
  useToast,
} from '@realwired/ui';

import { ReportWidget } from './ReportWidget';
import { ProposalCard } from './ProposalCard';
import { ORDERS } from '../data/orders';
import { bindingDateBasis } from '../lib/binding';
import { addToDashboard, setPlacements } from '../lib/boards';
import { applyPeriod } from '../lib/context';
import { OPENING_QUESTIONS } from '../lib/copilot';
import { createDashboard } from '../lib/dashboards';
import { saveReport } from '../lib/library';
import { packBoard } from '../lib/pack';
import {
  ask,
  beginBuild,
  setProposalName,
  settleProposal,
  toggleCandidate,
  useThread,
  type AnswerTurn,
  type ProposalTurn,
} from '../lib/thread';

/* ============================================================================
   The transcript — every turn the copilot has taken, and what each one offers.

   ⭐ ONE component, TWO surfaces. `/chat` draws it in an 820px reading column;
   the docked drawer draws it in 504px of panel. Everything about how a turn
   looks, what its offers do, and what happens when a proposal is accepted
   lives here exactly once.

   The alternative — a copy in each surface — is how the two would drift, and
   the drift would be silent: the drawer would keep working while `Add to a
   dashboard` on the page quietly stopped saving the report first, or the
   proposal on one surface would create a board the other could not.

   The turns themselves are in `lib/thread.ts`, above the router, which is what
   makes "ask in the drawer, open /chat, the turn is there" true.
   ========================================================================== */

/**
 * How long the card shows its building state.
 *
 * ⚠️ The work is genuinely instant — a few writes to three in-memory stores —
 * so this is a presentation decision and it should be defended as one rather
 * than smuggled in. A state change the eye never catches reads as the screen
 * glitching, and the reader is left unsure whether their board was built or
 * whether something else happened. One beat makes cause and effect legible.
 *
 * It matches `THINKING_MS` in `lib/thread.ts`, which is the same judgement
 * already made for answers: long enough to read as work, short enough that
 * nobody waits. Creating a board and answering a question should not run at
 * two different speeds in one conversation.
 *
 * ⛔ It is NOT a fake progress bar and must not become one. `ProgressStages`
 * exists in the library for real multi-second work and its own note says so;
 * naming stages here would be inventing a wait that does not happen.
 */
const BUILD_MS = 550;

export interface CopilotTranscriptProps {
  /**
   * How much height an answer widget gets.
   *
   * ⚠️ An explicit number rather than a class, and it is TRAPS §1: this app has
   * no Tailwind build, so `h-[360px]` computes to 0 and the widget collapses to
   * a title with no chart under it. A one-off pixel value goes in an inline
   * style, where it cannot evaporate.
   */
  widgetHeight: number;
  /** Keep the newest turn in view. The page scrolls its own body; the drawer scrolls the Sheet's. */
  scrollRef?: React.RefObject<HTMLElement | null>;
}

export function CopilotTranscript({ widgetHeight }: CopilotTranscriptProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { turns, pending } = useThread();

  const bottom = useRef<HTMLDivElement>(null);

  /* Follow the conversation down. `smooth` because this IS a response to
     something the reader did. */
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending]);

  /* ---- what the three offers under an ANSWER do ---- */

  const save = useCallback(
    (turn: AnswerTurn) => {
      saveReport(turn.answer.report);
      toast({
        tone: 'success',
        title: 'Saved to reports',
        description: `“${turn.answer.report.title}” is in your library.`,
        action: { label: 'View reports', onClick: () => navigate('/reports') },
      });
    },
    [toast, navigate]
  );

  const addToBoard = useCallback(
    (turn: AnswerTurn) => {
      saveReport(turn.answer.report);
      addToDashboard('overview', turn.answer.report.id);
      toast({
        tone: 'success',
        title: 'Added to Overview',
        description: `“${turn.answer.report.title}” is on the board.`,
        action: { label: 'Open Overview', onClick: () => navigate('/dashboards/overview') },
      });
    },
    [toast, navigate]
  );

  const editInBuilder = useCallback(
    (turn: AnswerTurn) => {
      saveReport(turn.answer.report);
      navigate(`/reports/${turn.answer.report.id}`);
    },
    [navigate]
  );

  /* ---- what a PROPOSAL does ---- */

  /**
   * Make the board.
   *
   * ⭐ The whole flow lands in these few lines, and every call is one that
   * already existed: save each spec to the library, mint the board, pack the
   * placements, set them.
   *
   * ⚠️ `setPlacements`, NOT `addToDashboard` in a loop. `addToDashboard` places
   * one report at `x: 0` on the first free row — correct for a single widget
   * arriving from the builder, and wrong for five at once, which would come out
   * as five full-width bands stacked down the page. `lib/pack.ts` lays them out
   * by shape the way the five shipped boards are laid out; this writes that
   * arrangement in one go.
   *
   * ⛔ IT DOES NOT NAVIGATE, and that is a correction rather than an omission.
   * It used to end with `navigate(...)`, so the page jumped to the new board
   * while the card was still offering `Open it` — the reader arrived somewhere
   * they had not asked to go, and the button that was supposed to take them
   * there had already been overtaken. Worse in the drawer, where the whole
   * point is that you stay on the board you were looking at.
   *
   * The acknowledgements are the ones that do not move anybody: the card
   * settles in place, the rail's count ticks up, and a toast says what
   * happened. `Open it` is the only thing that changes the route, and the
   * reader presses it — from the card or from the toast, both of which offer
   * it under that exact name.
   */
  const createBoard = useCallback((turn: ProposalTurn) => {
    const name = turn.name.trim();
    const chosen = turn.composition.candidates
      .filter((c) => turn.selected.includes(c.report.id))
      .map((c) => c.report);

    if (!name || chosen.length === 0) return;

    /* Show the work before doing it. The card needs one frame in its building
       state, or the reader sees the offer become a finished board with nothing
       in between — which is exactly the "it suddenly updated" complaint. */
    beginBuild(turn.id);

    window.setTimeout(() => {
      /* Into the library first. The board holds report REFERENCES — a
         placement whose id resolves to nothing renders an empty tile, which is
         the exact trap `lookupReport` exists to close. */
      for (const report of chosen) saveReport(report);

      const boardId = createDashboard(name);
      setPlacements(boardId, packBoard(chosen));

      settleProposal(turn.id, 'created', { id: boardId, name, widgets: chosen.length });

      /*
       * And say so.
       *
       * ⚠️ Re-added after being cut with the auto-navigation, which was the
       * wrong thing to cut with it. `App.tsx` states the rule this provider
       * exists for: the copilot's offers "each do something invisible — a
       * report written to the library, a tile placed on a board you are not
       * looking at — and an action with no acknowledgement reads as a dead
       * button." Creating a board writes five reports to the library and a row
       * to the rail, which is exactly that.
       *
       * It fires AFTER the build, not when the button was pressed: a toast
       * announcing a finished board while the card is still building it would
       * be the two of them disagreeing about what has happened.
       *
       * `Open it` here and `Open it` on the card, deliberately the same words
       * for the same act — an action keeps its name through a whole flow.
       */
      toast({
        tone: 'success',
        title: `${name} created`,
        description: `${chosen.length} widget${chosen.length === 1 ? '' : 's'} added, and saved to your reports.`,
        action: { label: 'Open it', onClick: () => navigate(`/dashboards/${boardId}`) },
      });
    }, BUILD_MS);
  }, [toast, navigate]);

  return (
    <>
      {turns.length === 0 && !pending && (
        <ChatOpener
          title="Ask about your book"
          blurb="Orders, fees, turnaround, clients. Answers come back as a widget you can keep — or ask for a dashboard and pick what goes on it."
        >
          <ChatSuggestions
            items={[...OPENING_QUESTIONS, 'Build me a dashboard for Northgate’s quarterly review']}
            onPick={ask}
          />
        </ChatOpener>
      )}

      {turns.map((turn, i) => {
        const last = i === turns.length - 1;

        /* ---- a proposal ---- */
        if (turn.kind === 'proposal') {
          return (
            <div key={turn.id} className="flex flex-col gap-7">
              <ChatMessage role="user">{turn.question}</ChatMessage>
              <ChatMessage role="assistant">
                <ProposalCard
                  turn={turn}
                  onToggle={(reportId) => toggleCandidate(turn.id, reportId)}
                  onRename={(name) => setProposalName(turn.id, name)}
                  onCreate={() => createBoard(turn)}
                  onDismiss={() => settleProposal(turn.id, 'dismissed')}
                  onOpenBoard={(id) => navigate(`/dashboards/${id}`)}
                />
              </ChatMessage>
            </div>
          );
        }

        /* ---- an answer ---- */
        const { answer } = turn;
        /* ⚠️ The date the binding GROUPS BY, not the blended default. TRAPS §3. */
        const rows = applyPeriod(
          ORDERS,
          answer.range,
          answer.basis ?? bindingDateBasis(answer.report.binding)
        );

        return (
          <div key={turn.id} className="flex flex-col gap-7">
            <ChatMessage role="user">{turn.question}</ChatMessage>

            <ChatMessage
              role="assistant"
              attachment={
                /* ⚠️ A height on the box AND `h-full` on the card. `.rw-tile-card`
                   only carries `height: 100%` under `.rw-grid`, so outside the
                   grid the card sizes to its own content and the plot gets
                   nothing. Both halves are needed. TRAPS §6. */
                <div style={{ height: widgetHeight }}>
                  <ReportWidget
                    className="rw-tile-card h-full"
                    report={answer.report}
                    type={answer.report.type}
                    binding={answer.report.binding}
                    rows={rows}
                    allRows={rows}
                    range={answer.range}
                    partialPeriod={answer.range.partial ? answer.range.covered : undefined}
                    fill
                  />
                </div>
              }
              actions={
                <>
                  <ChatAction icon="edit" onClick={() => editInBuilder(turn)}>
                    Edit in builder
                  </ChatAction>
                  <ChatAction icon="add" onClick={() => save(turn)}>
                    Save to reports
                  </ChatAction>
                  <ChatAction icon="dashboard" onClick={() => addToBoard(turn)}>
                    Add to a dashboard
                  </ChatAction>
                </>
              }
              note={answer.caveat ? <Callout tone="info">{answer.caveat}</Callout> : undefined}
            >
              {answer.prose}
            </ChatMessage>

            {/* Only the last answer offers follow-ups. Chips under an older turn
                invite branching a conversation backwards, which no transcript
                can then show honestly. */}
            {last && (
              <ChatSuggestions label="Worth asking next" items={answer.followups} onPick={ask} />
            )}
          </div>
        );
      })}

      {pending && (
        <>
          <ChatMessage role="user">{pending}</ChatMessage>
          <ChatThinking label="Reading your orders" />
        </>
      )}

      <div ref={bottom} />

    </>
  );
}
