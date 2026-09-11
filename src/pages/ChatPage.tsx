import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Callout,
  ChatAction,
  ChatComposer,
  ChatMessage,
  ChatOpener,
  ChatSuggestions,
  ChatThinking,
  ChatThreadRail,
  Flank,
  PageBody,
  PageHeader,
  useToast,
} from '@realwired/ui';

import { ReportWidget } from '../components/ReportWidget';
import { ORDERS } from '../data/orders';
import { bindingDateBasis } from '../lib/binding';
import { addToDashboard } from '../lib/boards';
import { OPENING_QUESTIONS, THREADS, route, type CopilotAnswer } from '../lib/copilot';
import { applyPeriod } from '../lib/context';
import { saveReport } from '../lib/library';

/* ============================================================================
   The reporting copilot — step 7.

   ⭐ It answers with a WIDGET, not a paragraph, and the widget is a real spec.
   `lib/copilot.tsx` holds the five scripted answers and the router; this file
   is the assembly. Every visible part is `@realwired/ui`'s.

   ## What is real here and what is scripted, stated plainly

   Scripted: which answer a question maps to, and the words. Real: the widget.
   The spec goes through the same binding engine, the same registry and the
   same `WidgetFrame` as a dashboard tile, over the same 11,314 rows — so the
   chart is not a picture of an answer, it IS one, and `Save to library` and
   `Add to a dashboard` write the objects they name.

   The surface says so, once, under the composer. A scripted answer that does
   not admit it is the only thing on this screen that could actually mislead.

   ## ⚠️ The date basis — TRAPS §3, and the builder failed it first

   `applyPeriod(ORDERS, answer.range, bindingDateBasis(answer.report.binding))`.
   Filtering completion while grouping submission spreads the same rows over a
   wider window and draws a movement that never happened. This is the FOURTH
   surface to resolve a binding; the check is to render the same report here
   and on a board and compare the bucket count.
   ========================================================================== */

interface Turn {
  id: string;
  question: string;
  answer: CopilotAnswer;
}

/** Long enough to read as work, short enough that nobody waits. */
const THINKING_MS = 550;

/*
 * ⚠️ INLINE STYLES, not Tailwind, and this is TRAPS §1 rather than a
 * preference: **this app has no Tailwind build.** Every utility class works
 * only because the library's compiled stylesheet already emitted that exact
 * class, and no arbitrary value is safe.
 *
 * It bit here twice in one pass, and the second one is a sharper version of
 * the trap than the file records:
 *
 *  · `h-[360px]` computed to **0px**, so the answer widget collapsed to a
 *    title and a coverage line with no chart between them — which also looks
 *    exactly like the scoped-tile-height trap in §6, and is not it.
 *  · `max-w-[820px]` DID work, which is worse. It resolves only because a
 *    Storybook STORY in the library happens to use that value
 *    (`atoms/Atoms.stories.tsx`). The reading measure of this page was
 *    depending on a story file nobody would think of as production surface,
 *    and editing that story would silently unbound this column.
 *
 * A one-off pixel value goes in a style attribute, where it cannot evaporate.
 */

/** The reading measure. ~75 characters at this type size, which is what prose wants. */
const COLUMN = 820;

/**
 * The answer widget's height.
 *
 * Tall enough for the shapes these answers use — a horizontal bar chart of six
 * categories, a twelve-point line — without pushing the follow-ups off screen
 * on a laptop. A dashboard tile takes its height from the grid; an answer has
 * no grid, so it states one.
 */
const ANSWER_H = 360;

export function ChatPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<string>();
  const [query, setQuery] = useState('');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  /* Follow the conversation down. `smooth` because this one IS a response to
     something the reader did — see the motion note in `Chat.tsx`. */
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending]);

  const ask = useCallback((question: string) => {
    const q = question.trim();
    if (!q) return;

    setDraft('');
    setPending(q);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const thread = route(q);
      setActiveThread(thread.id);
      setTurns((prev) => [
        ...prev,
        {
          id: `${thread.id}-${prev.length}`,
          question: q,
          answer: thread.answer,
        },
      ]);
      setPending(null);
    }, THINKING_MS);
  }, []);

  /* Opening a saved conversation REPLACES the transcript rather than appending
     to it. A thread is a conversation, and continuing yesterday's question
     under today's is how a rail stops meaning anything. */
  const openThread = useCallback((id: string) => {
    const thread = THREADS.find((t) => t.id === id);
    if (!thread) return;
    if (timer.current) clearTimeout(timer.current);
    setPending(null);
    setActiveThread(id);
    setTurns([{ id: `${thread.id}-0`, question: thread.prompt, answer: thread.answer }]);
  }, []);

  const startNew = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPending(null);
    setTurns([]);
    setActiveThread(undefined);
    setDraft('');
  }, []);

  /* ---- what the three offers under an answer actually do ---- */

  const save = useCallback(
    (turn: Turn) => {
      saveReport(turn.answer.report);
      toast({
        tone: 'success',
        title: 'Saved to reports',
        description: `“${turn.answer.report.title}” is in your library.`,
        action: { label: 'View reports', onClick: () => navigate('/reports') },
      });
    },
    [toast, navigate],
  );

  const addToBoard = useCallback(
    (turn: Turn) => {
      saveReport(turn.answer.report);
      /* Overview, because that is the board the demo opens on and a chooser
       here would be a second decision in the middle of a first. The tile is
       removable and the board resets in one click. */
      addToDashboard('overview', turn.answer.report.id);
      toast({
        tone: 'success',
        title: 'Added to Overview',
        description: `“${turn.answer.report.title}” is on the board.`,
        action: {
          label: 'Open Overview',
          onClick: () => navigate('/dashboards/overview'),
        },
      });
    },
    [toast, navigate],
  );

  const editInBuilder = useCallback(
    (turn: Turn) => {
      saveReport(turn.answer.report);
      navigate(`/reports/${turn.answer.report.id}`);
    },
    [navigate],
  );

  const railThreads = useMemo(
    () => THREADS.map(({ id, title, meta, group }) => ({ id, title, meta, group })),
    [],
  );

  return (
    /*
      ⚠️ `h-full`, not `flex-1`. MEASURED: AppShell's scroll container is a
      BLOCK element (`min-h-0 min-w-0 flex-1 overflow-y-auto`), so a `flex-1`
      child has no flex parent to grow inside and sizes to its content — the
      page came out 519px tall in a 945px viewport, with the composer floating
      in the middle of dead space. Every other page in this app flows and
      scrolls, so this is the first one that needed to fill.
    */
    <div className="flex h-full min-h-0">
      {/* Leading flank: navigation, read before the content. The component's
          own note explains why past conversations belong on this side. */}
      <Flank side="start" label="Conversations">
        <ChatThreadRail
          threads={railThreads}
          activeId={activeThread}
          onSelect={openThread}
          onNew={startNew}
          query={query}
          onQueryChange={setQuery}
        />
      </Flank>

      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader title="Reporting copilot" />

        {/* The transcript scrolls, not the page: the composer below is chrome
            and must not scroll away from the reader. */}
        <PageBody className="min-h-0 flex-1 overflow-y-auto">
          {/*
            One column, capped.

            65–75 characters is the measure prose is readable at, and an answer
            here is prose first. The widget sits in the same column rather than
            breaking out of it: a chart wider than the sentence that introduces
            it reads as a different section, and the whole claim of this screen
            is that they are one answer.
          */}
          <div className="mx-auto flex w-full flex-col gap-7" style={{ maxWidth: COLUMN }}>
            {turns.length === 0 && !pending && (
              <ChatOpener
                title="Ask about your book"
                blurb="Orders, fees, turnaround, clients. Answers come back as a widget you can keep — save it to your reports, or put it straight on a dashboard."
              >
                <ChatSuggestions items={OPENING_QUESTIONS} onPick={ask} />
              </ChatOpener>
            )}

            {turns.map((turn, i) => {
              const { answer } = turn;
              /* ⚠️ The date the binding GROUPS BY, not the blended default.
                 See the header note and TRAPS §3. */
              const rows = applyPeriod(
                ORDERS,
                answer.range,
                answer.basis ?? bindingDateBasis(answer.report.binding),
              );
              const last = i === turns.length - 1;

              return (
                <div key={turn.id} className="flex flex-col gap-7">
                  <ChatMessage role="user">{turn.question}</ChatMessage>

                  <ChatMessage
                    role="assistant"
                    attachment={
                      /*
                        ⚠️ An explicit height, and it is not cosmetic. A tile's
                        height comes from `.rw-grid .rw-tile > .rw-tile-card`,
                        which is SCOPED TO THE GRID — render a WidgetFrame
                        anywhere else and it collapses to its content: a title,
                        a legend, a coverage line, and no chart between them.
                        And `h-full` on the CARD as well as a height on the
                        box — `.rw-tile-card` only carries `height: 100%` under
                        `.rw-grid`, so outside the grid the card sizes to its
                        own content and the plot inside gets nothing. Both
                        halves are needed; the box alone renders a 360px void
                        with a title at the top of it. TRAPS §6.
                      */
                      <div style={{ height: ANSWER_H }}>
                        <ReportWidget
                          className="rw-tile-card h-full"
                          report={answer.report}
                          type={answer.report.type}
                          binding={answer.report.binding}
                          rows={rows}
                          allRows={rows}
                          range={answer.range}
                          partialPeriod={
                            answer.range.partial ? answer.range.covered : undefined
                          }
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
                    note={
                      answer.caveat ? (
                        /*
                          The caveat is the trust lever, so it gets a surface
                          rather than a footnote. The blocker on this product
                          is confidence, and an answer that names what it could
                          not see is the cheapest way to earn it — the widget's
                          own coverage line states the arithmetic, and this
                          states what the arithmetic means.
                        */
                        <Callout tone="info">{answer.caveat}</Callout>
                      ) : undefined
                    }
                  >
                    {answer.prose}
                  </ChatMessage>

                  {/* Only the last answer offers follow-ups. Chips under an
                      older turn invite you to branch a conversation backwards,
                      which no transcript can then show honestly. */}
                  {last && (
                    <ChatSuggestions
                      label="Worth asking next"
                      items={answer.followups}
                      onPick={ask}
                    />
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
          </div>
        </PageBody>

        {/* The composer is chrome, not content: it stays put while the
            transcript scrolls behind it, so the way to ask is never something
            you have to scroll to find. */}
        <div className="border-t border-border-subtle bg-surface px-[var(--rw-page-x)] py-3">
          <div className="mx-auto w-full" style={{ maxWidth: COLUMN }}>
            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSubmit={() => ask(draft)}
              busy={Boolean(pending)}
              placeholder="Ask about your orders, fees or turnaround"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
