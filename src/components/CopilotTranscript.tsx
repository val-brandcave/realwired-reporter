import { useCallback, useEffect, useRef, useState } from 'react';
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
import { DashboardNameDialog } from './DashboardNameDialog';
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

  /*
   * The proposal waiting on a name.
   *
   * Local, not in the store, because exactly one transcript is ever mounted —
   * the drawer is not summonable on `/chat`, since that page IS the copilot.
   * A second instance would mean two dialogs racing for the same turn.
   */
  const [naming, setNaming] = useState<ProposalTurn | null>(null);

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
   * placements, set them, go there.
   *
   * ⚠️ `setPlacements`, NOT `addToDashboard` in a loop. `addToDashboard` places
   * one report at `x: 0` on the first free row — correct for a single widget
   * arriving from the builder, and wrong for five at once, which would come out
   * as five full-width bands stacked down the page. `lib/pack.ts` lays them out
   * by shape the way the five shipped boards are laid out; this writes that
   * arrangement in one go.
   */
  const createBoard = useCallback(
    (turn: ProposalTurn, name: string) => {
      const chosen = turn.composition.candidates
        .filter((c) => turn.selected.includes(c.report.id))
        .map((c) => c.report);

      /* Into the library first. The board holds report REFERENCES — a
         placement whose id resolves to nothing renders an empty tile, which is
         the exact trap `lookupReport` exists to close. */
      for (const report of chosen) saveReport(report);

      const boardId = createDashboard(name);
      setPlacements(boardId, packBoard(chosen));

      settleProposal(turn.id, 'created', { id: boardId, name, widgets: chosen.length });
      setNaming(null);

      toast({
        tone: 'success',
        title: `${name} created`,
        description: `${chosen.length} widget${chosen.length === 1 ? '' : 's'} added and saved to your reports.`,
        action: { label: 'Open it', onClick: () => navigate(`/dashboards/${boardId}`) },
      });

      /* Land on it. The reader asked for a dashboard; showing them the board
         rather than a confirmation is the answer to what they asked. */
      navigate(`/dashboards/${boardId}`);
    },
    [toast, navigate]
  );

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
                  onCreate={() => setNaming(turn)}
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

      {/* The name, asked after the widgets are chosen — so you are naming
          something you have already seen. Same component as New, Duplicate and
          Rename; the words are what differ. */}
      <DashboardNameDialog
        open={naming !== null}
        title="Name this dashboard"
        confirmLabel="Create dashboard"
        initialName={naming?.composition.parsed.suggestedName ?? ''}
        onConfirm={(name) => naming && createBoard(naming, name)}
        onCancel={() => setNaming(null)}
      />
    </>
  );
}
