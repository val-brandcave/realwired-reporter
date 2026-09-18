import { type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Flank, Icon, IconButton } from '@realwired/ui';

import { CopilotComposer } from './CopilotComposer';
import { CopilotTranscript } from './CopilotTranscript';
import { setDrawerOpen, toggleDrawer, useThread } from '../lib/thread';

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
 * It reports its own state, which a dock needs and a modal drawer did not. A
 * `Sheet` announces itself by dimming the world; a panel that is simply part of
 * the layout does not, so the control that opened it has to say that it is on.
 * `outline` over `ghost` is that difference — the same button, sitting up.
 */
export function CopilotToggle() {
  const { drawerOpen } = useThread();

  return (
    <Button
      variant={drawerOpen ? 'outline' : 'ghost'}
      size="sm"
      iconLeft="comment"
      aria-pressed={drawerOpen}
      aria-controls="rw-copilot-dock"
      onClick={toggleDrawer}
    >
      Copilot
    </Button>
  );
}

export function CopilotDrawer() {
  const navigate = useNavigate();
  const { drawerOpen } = useThread();

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
        label="Copilot"
        width={`${DOCK_W}px`}
        className="rw-dock-panel"
        contentClassName="rw-dock-body"
        header={
          /*
           * One 60px band, because that is what a flank's header is — so the
           * `Sheet`'s two-line eyebrow-over-title had to become one line. No
           * loss: "Ask about your book" was a restatement of the composer's own
           * placeholder sitting two inches above it.
           */
          <>
            <span
              aria-hidden
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 26,
                height: 26,
                flex: 'none',
                borderRadius: 'var(--rw-radius-xs)',
                background: 'var(--rw-primary)',
                color: 'var(--rw-primary-contrast)',
              }}
            >
              <Icon name="comment" size={15} />
            </span>
            <span className="font-semibold text-ink">Copilot</span>
            <span className="flex-1" />
            {/* The way out to the full page, where the conversation rail lives. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDrawerOpen(false);
                navigate('/chat');
              }}
            >
              Open in chat
            </Button>
            <IconButton
              icon="close"
              label="Close the copilot"
              size="sm"
              onClick={() => setDrawerOpen(false)}
            />
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
      </Flank>
    </div>
  );
}
