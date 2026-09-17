import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ChatComposer, Sheet } from '@realwired/ui';

import { CopilotTranscript } from './CopilotTranscript';
import { ask, setDrawerOpen, useThread } from '../lib/thread';

/* ============================================================================
   The copilot, docked beside the thing you are changing.

   The sibling prototype docks its assistant on the right from any page;
   Reporter had only `/chat`. The full design is in
   `docs/DESIGN-copilot-drawer.md`.

   ⭐ One copilot, two surfaces, ONE thread — not a second chat. `/chat` stays
   exactly what the approved `Copilot.dc.html` artboard draws: the destination,
   with its conversation rail. This is the same conversation, reachable without
   leaving the board.

   The case for it is the EditMode acceptance criterion: someone must be able
   to drop into a live session, rearrange a board and pull in new graphs
   alongside the person they are talking to, without leaving the board.

   Our copilot answers with a real widget carrying `Save to library` and `Add
   to a dashboard`, and both of those are strongest when the board you would
   add to is on the screen behind them. A full page makes the copilot somewhere
   you GO, and going there means leaving the thing you were changing.

   ⚠️ A departure from the approved canvas, which draws one copilot surface.
   Recorded rather than absorbed — that is what the design doc is for, and it
   goes back to the client as a decision.

   ## `modal={false}`, which is the whole point

   The scrim and the blur drop, the page stays interactive, focus is not
   trapped. So a reader can ask three questions and watch each answer land
   against the live board. `AddReportRail` is already this pattern on the
   dashboard, so the drawer is the second instance of a behaviour the app has
   rather than a new idea.

   ## `size="panel"` — 560px, and it is measured

   MEASURED twice, on record: a two-up card is **436px** before its labels wrap
   and its chart starts dropping categories. `Sheet`'s `half` is 420 and is
   under that floor; `tall` is 680 and takes the board the panel exists to sit
   beside. `panel` was added to the library for this and clears 436 with room
   for the Sheet's own 28px gutters — 504px of content.
   ========================================================================== */

/**
 * The answer widget's height in the drawer.
 *
 * ⚠️ Inline, not a class: this app has no Tailwind build, so an arbitrary
 * value computes to 0 and the widget renders as a title over a void. TRAPS §1.
 *
 * The same 360 the chat page uses. A narrower box does not want a shorter one
 * — if anything the reverse, since a horizontal bar chart's labels wrap sooner
 * and the plot needs the rows.
 */
const ANSWER_H = 360;

export function CopilotDrawer() {
  const navigate = useNavigate();
  const { drawerOpen, pending } = useThread();
  const [draft, setDraft] = useState('');

  const send = () => {
    ask(draft);
    setDraft('');
  };

  return (
    <Sheet
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
      side="right"
      size="panel"
      modal={false}
      eyebrow="Copilot"
      title="Ask about your book"
      headerEnd={
        /* The way out to the full page, where the conversation rail lives. The
           drawer deliberately does not carry that rail — a second thread list
           in a 560px panel is the thing `/chat` already is. */
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
      }
      footerFill
      footer={
        /* The composer is the footer rather than the last thing in the scroll
           area, so the way to ask never scrolls away from the reader. Same
           decision as the chat page, arrived at the same way.

           `footerFill` because the default footer is a right-aligned button
           group — a composer in it sizes to its placeholder and strands 400px
           of empty footer beside it. */
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={send}
          busy={Boolean(pending)}
          placeholder="Ask, or say “build me a dashboard for…”"
        />
      }
    >
      <div className="flex flex-col gap-7">
        <CopilotTranscript widgetHeight={ANSWER_H} />
      </div>
    </Sheet>
  );
}
