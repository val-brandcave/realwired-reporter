import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ChatThreadRail, Flank, Icon, IconButton, Tooltip } from '@realwired/ui';

import { CopilotComposer } from './CopilotComposer';
import { CopilotTranscript } from './CopilotTranscript';
import { THREADS } from '../lib/copilot';
import { openThread, setDrawerOpen, startNew, toggleDrawer, useThread } from '../lib/thread';

/* ============================================================================
   The copilot, docked BESIDE the thing you are changing — and taking room from
   it rather than sitting on top of it.

   The full design is in `docs/DESIGN-copilot-drawer.md`.

   ⭐ One copilot, two surfaces, ONE thread — not a second chat. `/chat` stays
   exactly what the approved `Copilot.dc.html` artboard draws: the destination,
   with its conversation rail. This is the same conversation, reachable without
   leaving the board.

   The case for it is the EditMode acceptance criterion: someone must be able
   to drop into a live session, rearrange a board and pull in new graphs
   alongside the person they are talking to, without leaving the board.

   ⚠️ A departure from the approved canvas, which draws one copilot surface.
   Recorded rather than absorbed — that is what the design doc is for, and it
   goes back to the client as a decision.

   ## ⭐⭐ It PUSHES. That is the change, and it is the whole component.

   This was a non-modal `Sheet` until 18 Sept, and non-modal fixed the wrong
   half of the problem. Dropping the scrim keeps the board VISIBLE and
   clickable; it does not stop a 560px panel landing on top of the right-hand
   third of it. On Overview that third is two tiles, and they were the two you
   would most want to watch while asking the copilot to change them.

   So the panel is now an ordinary flex child of `AppShell`'s content row — the
   `dock` slot, holding a `Flank side="end"`, which is the primitive the library
   built for exactly this and whose own note says a product tempted to make it
   an overlay should have to argue with that paragraph first. This app was
   arguing with it.

   What that buys, concretely: the dashboard grid re-lays out around the panel,
   so every tile stays whole and on screen at a narrower width, and nothing the
   copilot is talking about is behind it. Ask it to build a board and you watch
   the rail take the board. That is the demo beat, and an overlay hid half of it.

   The sibling prototype has docked its assistant this way from the start, at
   400px: the page is a flex sibling, the panel animates its WIDTH, and the
   content reflows. Measured there on 18 Sept at a 1920 viewport — page 1274,
   dock 400, meeting exactly at 1510, nothing overlapping. This is that, in our
   shell's own grammar.

   ## What it deliberately does NOT carry

   ⛔ No conversation rail. A second thread list in 480px is a worse copy of the
   screen `Open in chat` is one click from. `/chat` owns that.
   ========================================================================== */

/**
 * The answer widget's height in the dock.
 *
 * ⚠️ Inline, not a class: this app has no Tailwind build, so an arbitrary
 * value computes to 0 and the widget renders as a title over a void. TRAPS §1.
 *
 * The same 360 the chat page uses. A narrower box does not want a shorter one
 * — if anything the reverse, since a horizontal bar chart's labels wrap sooner
 * and the plot needs the rows.
 */
const ANSWER_H = 360;

/**
 * The panel's width.
 *
 * 480, and the reasoning is written beside the number in `app.css` under
 * `.rw-dock-clip[data-open='true']`, because that is where the board's half of
 * the argument lives too. It is measured from both sides — what the copilot's
 * own widgets need, and what the board can give up — not chosen.
 *
 * ⚠️ The stylesheet opens the clip to the same number. If the two disagree the
 * panel reflows while it slides, which is the one thing the clip exists to
 * prevent.
 */
const DOCK_W = 480;

/**
 * The summon control, for the app header.
 *
 * ⭐ Its own component, and not for tidiness: it subscribes to the thread store
 * so that `App` does not have to. Read `drawerOpen` up there and the whole
 * router re-renders every time a turn lands.
 *
 * ⭐ PRIMARY, with the sparkle, reading "Ask AI Assistant" — Val, 18 Sept.
 *
 * It was a quiet ghost button that said "Copilot", which made the one genuinely
 * new thing in this product the most easily missed control in the chrome. The
 * header carries a rail toggle, a page name and an avatar; the assistant is the
 * only thing there anyone would want to be invited to use.
 *
 * ⚠️ It stays primary when the panel is OPEN rather than switching to outline
 * to show state. A 480px panel that has just pushed the board across is not a
 * state anyone can miss, so the button does not need to carry it visually —
 * but `aria-pressed` still says so, because a screen-reader user has no panel
 * to look at. The one thing this costs is that the label reads as an
 * invitation while the invitation is already accepted; a second label would be
 * a control whose words change under you, which is the trade this project
 * already made once on the dashboard title.
 */
export function CopilotToggle() {
  const { drawerOpen } = useThread();

  return (
    <Button
      variant="primary"
      size="sm"
      iconLeft="ai"
      aria-pressed={drawerOpen}
      aria-controls="rw-copilot-dock"
      onClick={toggleDrawer}
    >
      Ask AI Assistant
    </Button>
  );
}

export function CopilotDrawer() {
  const navigate = useNavigate();
  const { drawerOpen, activeThreadId } = useThread();
  /*
   * Past conversations, over the dock rather than beside it.
   *
   * ⭐ This REVERSES what this file argued until 18 Sept — that a second thread
   * list in a 480px panel was a worse copy of `/chat`. That was right about a
   * list that lives there permanently and wrong about the need: picking up
   * yesterday's question about the board in front of you was the one thing the
   * dock could not do, and "go to the full page for history" sends you away
   * from the board the history is about.
   *
   * A slide-over resolves both. It costs the dock nothing at rest — the panel
   * is its full width the moment a thread is picked — so the board never pays
   * for a list used once a minute. The sibling prototype reached the same
   * answer, and this is that, in our shell's grammar.
   */
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const railThreads = useMemo(
    () => THREADS.map(({ id, title, meta, group }) => ({ id, title, meta, group })),
    []
  );

  /* Closing the dock closes the slide-over with it. Re-opening the dock onto a
     thread list the reader left up ten minutes ago would hide the conversation
     they came back for. */
  useEffect(() => {
    if (!drawerOpen) setThreadsOpen(false);
  }, [drawerOpen]);

  /*
   * Escape closes it, but only from INSIDE.
   *
   * A modal sheet can take Escape globally because it owns the screen while it
   * is up. This one does not: the board beside it is live, and someone
   * pressing Escape out of a tile menu or a filter popover is not asking for
   * the copilot to go away. Scoped to the panel, Escape stays the "get me out
   * of here" key it is everywhere else and it means only this.
   *
   * A half-typed question survives it, because the panel stays mounted.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !drawerOpen) return;
    e.stopPropagation();
    /*
     * ⚠️ One layer at a time. With the conversations slide-over up, Escape
     * closes THAT and leaves the assistant open — dismissing both would take
     * away the panel the reader was mid-way through using, and they would have
     * to summon it again to get back to the conversation they were already in.
     */
    if (threadsOpen) {
      setThreadsOpen(false);
      return;
    }
    setDrawerOpen(false);
  };

  return (
    /*
     * The clip, which is what actually opens and closes.
     *
     * ⚠️ The panel inside keeps its full 480 at all times and the WRAPPER
     * carries the width. So the contents are laid out exactly once, at the
     * width they will be read at, rather than being drawn at 40, then 120,
     * then 300 on the way there.
     *
     *
     * ⭐ It stays MOUNTED when closed rather than unmounting. Closing the dock
     * mid-sentence should not throw away what you had typed, and the
     * transcript should not re-run its scroll-to-bottom every time the panel
     * is summoned. `visibility` in the stylesheet takes it out of the tab
     * order, which is the part that actually matters.
     */
    <div
      id="rw-copilot-dock"
      className="rw-dock-clip"
      data-open={drawerOpen}
      aria-hidden={!drawerOpen}
      onKeyDown={onKeyDown}
    >
      <Flank
        side="end"
        label="AI Assistant"
        width={`${DOCK_W}px`}
        className="rw-dock-panel"
        contentClassName="rw-dock-body"
        header={
          /*
           * One 60px band, because that is what a flank's header is — so the
           * `Sheet`'s two-line eyebrow-over-title had to become one line. No
           * loss: "Ask about your book" was a restatement of the composer's own
           * placeholder sitting two inches above it.
           *
           * ⭐ The controls are ICONS with tooltips, not words. Four actions in
           * 480px minus a title cannot each carry a label — `Open in chat` alone
           * was 96px — and these are the four every assistant puts here, so the
           * glyphs are ones readers arrive already knowing. The tooltip is what
           * makes that safe rather than a guess.
           */
          <>
            <Tooltip content="Conversations" side="bottom">
              <IconButton
                icon="menu"
                label="Conversations"
                size="sm"
                aria-expanded={threadsOpen}
                onClick={() => setThreadsOpen(true)}
              />
            </Tooltip>
            <span className="rw-dock-mark" aria-hidden>
              {/* The sparkle, matching the control that summons it — the button
                  in the header and the band at the top of what it opens are the
                  same object arriving. */}
              <Icon name="ai" size={15} />
            </span>
            <span className="font-semibold text-ink">AI Assistant</span>
            <span className="flex-1" />
            <Tooltip content="New chat" side="bottom">
              <IconButton
                icon="edit"
                label="New chat"
                size="sm"
                onClick={() => {
                  startNew();
                  setThreadsOpen(false);
                }}
              />
            </Tooltip>
            {/* The way out to the full page, where the conversation rail is a
                permanent surface rather than something you slide over. */}
            <Tooltip content="Open full page" side="bottom">
              <IconButton
                icon="expand"
                label="Open full page"
                size="sm"
                onClick={() => {
                  setDrawerOpen(false);
                  navigate('/chat');
                }}
              />
            </Tooltip>
            <Tooltip content="Close" side="bottom">
              <IconButton
                icon="close"
                label="Close the assistant"
                size="sm"
                onClick={() => setDrawerOpen(false)}
              />
            </Tooltip>
          </>
        }
        footer={
          /* The composer is the footer rather than the last thing in the scroll
             area, so the way to ask never scrolls away from the reader. Same
             decision as the chat page, arrived at the same way.

             ⚠️ NOT `raised` here, and that is the one difference between the
             two surfaces. The chat page's composer floats because it is the
             point of that screen; in a 480px panel a shadow and a wider radius
             inside a bordered footer inside a bordered panel is three nested
             edges in 40px of height. The band is correct when the panel around
             it is already the frame. */
          <CopilotComposer placeholder="Ask, or say “build me a dashboard for…”" />
        }
      >
        <div className="flex flex-col gap-7">
          <CopilotTranscript widgetHeight={ANSWER_H} />
        </div>

        {/* ============================================================
            The conversations slide-over.

            ⚠️ It is a sibling of the transcript INSIDE the flank, absolutely
            positioned over the whole panel — header, body and composer. It has
            to cover the composer: a thread list with a live "Ask…" field
            underneath it offers two things at once and the reader cannot tell
            which one Enter belongs to.

            ⚠️ Rendered only while open rather than kept mounted and hidden.
            Unlike the dock itself there is no draft to preserve here, and a
            mounted list would keep a stale search string and a scroll position
            from a visit the reader has forgotten.
            ============================================================ */}
        {threadsOpen && (
          <>
            {/* The strip of transcript still showing at the trailing edge is
                what says this is OVER the conversation rather than instead of
                it. Clicking it is the way back. */}
            <button
              type="button"
              className="rw-threads-scrim"
              aria-label="Close conversations"
              onClick={() => setThreadsOpen(false)}
            />
            <div className="rw-threads-over" role="dialog" aria-label="Conversations">
              <div className="rw-threads-head">
                <span className="rw-dock-mark" aria-hidden>
                  <Icon name="ai" size={15} />
                </span>
                <span className="font-semibold text-ink">Conversations</span>
                <span className="flex-1" />
                <Tooltip content="Hide" side="bottom">
                  <IconButton
                    icon="panel-close"
                    label="Hide conversations"
                    size="sm"
                    onClick={() => setThreadsOpen(false)}
                  />
                </Tooltip>
              </div>
              <div className="rw-threads-body">
                <ChatThreadRail
                  threads={railThreads}
                  activeId={activeThreadId}
                  /* Picking one closes the panel: the reader asked to see that
                     conversation, and leaving the list up over it would mean
                     they had to dismiss the thing they just chose. */
                  onSelect={(id) => {
                    openThread(id);
                    setThreadsOpen(false);
                  }}
                  onNew={() => {
                    startNew();
                    setThreadsOpen(false);
                  }}
                  query={query}
                  onQueryChange={setQuery}
                />
              </div>
            </div>
          </>
        )}
      </Flank>
    </div>
  );
}
